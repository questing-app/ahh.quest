import { Hono } from 'hono'
import type { Env, AuthContext } from '../types'
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth'
import { createDbClient } from '../db/client'
import { quests, claims, proofs, users } from '../db/schema'
import { eq, desc, inArray } from 'drizzle-orm'
import { fetchQuest, variant } from '@quest/sdk'
import { createQuest, getQuestById, listQuests, formatQuest, formatQuestsWithCreators } from '../services/quest.service'
import { isDescriptionAllowed } from '../services/moderation.service'
import { checkQuestCreateLimit } from '../middleware/rate-limit'
import { validateClaim, recordClaim, formatClaim } from '../services/claim.service'
import { getProgram } from '../lib/solana'
import { BadRequest, NotFound, Forbidden, RateLimited } from '../lib/errors'
import { pathParam } from '../lib/params'

export const questRoutes = new Hono<{ Bindings: Env }>()

// POST /api/quests/check
// Run before the creator signs, so a refused quest never locks funds.
questRoutes.post('/check', authMiddleware, async (c) => {
  const auth = c.get('auth') as AuthContext
  const { description } = await c.req.json<{ description: string }>()

  const modCheck = isDescriptionAllowed(description ?? '')
  if (!modCheck.allowed) throw new BadRequest(modCheck.reason!)

  const allowed = await checkQuestCreateLimit(c.env.RATE_LIMIT_KV, auth.pubkey)
  if (!allowed) throw new RateLimited('You can post 10 quests a day')

  return c.json({ ok: true })
})

// POST /api/quests
// Records a quest the creator already funded on-chain.
questRoutes.post('/', authMiddleware, async (c) => {
  const auth = c.get('auth') as AuthContext
  const body = await c.req.json<{ description: string; onchainId: string; txSignature: string }>()
  if (!body.description || !body.onchainId || !body.txSignature) {
    throw new BadRequest('description, onchainId and txSignature are required')
  }

  const db = createDbClient(c.env)
  const quest = await createQuest(db, c.env, {
    creatorId: auth.userId,
    creatorPubkey: auth.pubkey,
    description: body.description,
    onchainId: body.onchainId,
    txSignature: body.txSignature,
  })

  return c.json(formatQuest(quest), 201)
})

// GET /api/quests
questRoutes.get('/', optionalAuthMiddleware, async (c) => {
  const db = createDbClient(c.env)
  const results = await listQuests(db, {
    status: c.req.query('status'),
    questType: c.req.query('type'),
    creator: c.req.query('creator'),
    limit: c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined,
    offset: c.req.query('offset') ? parseInt(c.req.query('offset')!) : undefined,
  })

  return c.json(await formatQuestsWithCreators(db, results))
})

// GET /api/quests/:questId
questRoutes.get('/:questId', optionalAuthMiddleware, async (c) => {
  const db = createDbClient(c.env)
  const quest = await getQuestById(db, pathParam(c, 'questId'))
  if (!quest) throw new NotFound('Quest not found')
  const [withCreator] = await formatQuestsWithCreators(db, [quest])
  return c.json(withCreator)
})

// GET /api/quests/:questId/claims
// Everyone sees who claimed. The proof video and AI notes are visible to the
// quest creator, to the claimer, and to everyone once the claim is approved.
questRoutes.get('/:questId/claims', optionalAuthMiddleware, async (c) => {
  const auth = c.get('auth') as AuthContext | null
  const db = createDbClient(c.env)
  const quest = await getQuestById(db, pathParam(c, 'questId'))
  if (!quest) throw new NotFound('Quest not found')

  const rows = await db.select().from(claims)
    .where(eq(claims.questId, quest.id))
    .orderBy(desc(claims.claimedAt))
    .all()
  if (rows.length === 0) return c.json([])

  const claimIds = rows.map((r) => r.id)
  const claimerIds = [...new Set(rows.map((r) => r.claimerId))]
  const [proofRows, claimerRows] = await Promise.all([
    db.select().from(proofs).where(inArray(proofs.claimId, claimIds)).all(),
    db.select({ id: users.id, username: users.username, pubkey: users.pubkey, avatarUrl: users.avatarUrl })
      .from(users).where(inArray(users.id, claimerIds)).all(),
  ])
  const proofByClaim = new Map(proofRows.map((p) => [p.claimId, p]))
  const claimerById = new Map(claimerRows.map((u) => [u.id, u]))
  const isCreator = auth?.userId === quest.creatorId

  return c.json(rows.map((claim) => {
    const proof = proofByClaim.get(claim.id)
    const canSeeProof = isCreator || auth?.userId === claim.claimerId || claim.status === 'approved'
    return {
      ...formatClaim(claim),
      claimer: claimerById.get(claim.claimerId) ?? null,
      proof: proof && canSeeProof ? {
        id: proof.id,
        videoUrl: proof.videoUrl,
        thumbnailUrl: proof.thumbnailUrl,
        durationSeconds: proof.durationSeconds,
        aiConfidence: proof.aiConfidence,
        aiDecision: proof.aiDecision,
        aiReasoning: proof.aiReasoning,
        finalDecision: proof.finalDecision,
        decidedBy: proof.decidedBy,
        createdAt: proof.createdAt,
      } : null,
    }
  }))
})

// DELETE /api/quests/:questId
// The creator signs cancel_quest first; this mirrors it once the refund landed.
questRoutes.delete('/:questId', authMiddleware, async (c) => {
  const auth = c.get('auth') as AuthContext
  const db = createDbClient(c.env)
  const quest = await getQuestById(db, pathParam(c, 'questId'))

  if (!quest) throw new NotFound('Quest not found')
  if (quest.creatorId !== auth.userId) throw new Forbidden('Not your quest')

  const account = await fetchQuest(getProgram(c.env), quest.onchainId)
  if (!account || variant(account.status) !== 'cancelled') {
    throw new BadRequest('Quest is not cancelled on-chain')
  }

  await db.update(quests).set({ status: 'cancelled' }).where(eq(quests.id, quest.id))
  return c.body(null, 204)
})

// POST /api/quests/:questId/claim/check
questRoutes.post('/:questId/claim/check', authMiddleware, async (c) => {
  const auth = c.get('auth') as AuthContext
  const db = createDbClient(c.env)
  const result = await validateClaim(db, pathParam(c, 'questId'), auth.userId, auth.pubkey)
  if ('error' in result) throw new BadRequest(result.error!)
  return c.json({ ok: true })
})

// POST /api/quests/:questId/claim
// Records a claim the user already signed on-chain.
questRoutes.post('/:questId/claim', authMiddleware, async (c) => {
  const auth = c.get('auth') as AuthContext
  const { txSignature } = await c.req.json<{ txSignature: string }>()
  if (!txSignature) throw new BadRequest('txSignature is required')

  const db = createDbClient(c.env)
  const quest = await getQuestById(db, pathParam(c, 'questId'))
  if (!quest) throw new NotFound('Quest not found')

  const claim = await recordClaim(db, c.env, quest, auth.userId, auth.pubkey, txSignature)
  return c.json(formatClaim(claim), 201)
})
