import { Hono } from 'hono'
import type { Env, AuthContext } from '../types'
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth'
import { createDbClient } from '../db/client'
import { quests, claims, proofs, users } from '../db/schema'
import { and, asc, desc, eq, inArray, like, sql } from 'drizzle-orm'
import { formatQuestsWithCreators } from '../services/quest.service'
import { formatClaim } from '../services/claim.service'

export const feedRoutes = new Hono<{ Bindings: Env }>()

// GET /api/feed — open quests.
//   q     text search in the description
//   sort  new (default) | ending | biggest
//   for   me → only quests posted for the signed-in wallet
feedRoutes.get('/', optionalAuthMiddleware, async (c) => {
  const auth = c.get('auth') as AuthContext | null
  const db = createDbClient(c.env)
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 50)
  const offset = parseInt(c.req.query('offset') || '0')
  const q = (c.req.query('q') ?? '').trim().slice(0, 80)
  const sort = c.req.query('sort')

  const filters = [eq(quests.status, 'active')]
  // LIKE wildcards in the search are dropped rather than escaped.
  if (q.replace(/[%_]/g, '')) filters.push(like(quests.description, `%${q.replace(/[%_]/g, '')}%`))
  if (c.req.query('for') === 'me') {
    if (!auth) return c.json([])
    filters.push(eq(quests.targetPubkey, auth.pubkey))
  }

  const order =
    sort === 'biggest' ? [desc(quests.rewardAmount), desc(quests.createdAt)]
    : sort === 'ending' ? [sql`${quests.deadline} is null`, asc(quests.deadline), desc(quests.createdAt)]
    : [desc(quests.createdAt)]

  const results = await db.select()
    .from(quests)
    .where(and(...filters))
    .orderBy(...order)
    .limit(limit)
    .offset(offset)
    .all()

  return c.json(await formatQuestsWithCreators(db, results))
})

// GET /api/feed/mine — user's quests + claims
feedRoutes.get('/mine', authMiddleware, async (c) => {
  const auth = c.get('auth') as AuthContext
  const db = createDbClient(c.env)

  const myQuests = await db.select()
    .from(quests)
    .where(eq(quests.creatorId, auth.userId))
    .orderBy(desc(quests.createdAt))
    .all()

  const myClaims = await db.select()
    .from(claims)
    .where(eq(claims.claimerId, auth.userId))
    .orderBy(desc(claims.claimedAt))
    .all()

  // Claims are listed with their quest so the client can render them directly.
  const claimedQuestIds = [...new Set(myClaims.map((cl) => cl.questId))]
  const claimedQuests = claimedQuestIds.length
    ? await db.select().from(quests).where(inArray(quests.id, claimedQuestIds)).all()
    : []
  const questById = new Map(
    (await formatQuestsWithCreators(db, claimedQuests)).map((q) => [q.id, q]),
  )

  // Attempts on my quests that are still live, so Activity can show what needs me.
  const liveQuestIds = myQuests.filter((q) => q.status === 'active' || q.status === 'claimed').map((q) => q.id)
  const incomingRows = liveQuestIds.length
    ? await db.select().from(claims)
      .where(and(inArray(claims.questId, liveQuestIds), inArray(claims.status, ['active', 'submitted'])))
      .all()
    : []
  const claimerRows = incomingRows.length
    ? await db.select({ id: users.id, username: users.username, pubkey: users.pubkey, avatarUrl: users.avatarUrl })
      .from(users).where(inArray(users.id, [...new Set(incomingRows.map((r) => r.claimerId))])).all()
    : []
  const proofRows = incomingRows.length
    ? await db.select({ claimId: proofs.claimId, aiDecision: proofs.aiDecision })
      .from(proofs).where(inArray(proofs.claimId, incomingRows.map((r) => r.id))).all()
    : []
  const claimerById = new Map(claimerRows.map((u) => [u.id, u]))

  // Deposits that came to me because an attempt on my quest fell through.
  const kept = myQuests.length
    ? await db.select({
        id: claims.id, questId: claims.questId, status: claims.status,
        stakeAmount: claims.stakeAmount, settledAt: claims.settledAt, claimedAt: claims.claimedAt,
      }).from(claims)
      .where(and(
        inArray(claims.questId, myQuests.map((q) => q.id)),
        inArray(claims.status, ['rejected', 'expired', 'abandoned']),
      ))
      .all()
    : []
  const checked = new Set(proofRows.filter((p) => p.aiDecision !== null).map((p) => p.claimId))

  return c.json({
    incoming: incomingRows.map((cl) => ({
      ...formatClaim(cl),
      claimer: claimerById.get(cl.claimerId) ?? null,
      checked: checked.has(cl.id),
    })),
    kept,
    quests: await formatQuestsWithCreators(db, myQuests),
    claims: myClaims.map((cl) => ({ ...formatClaim(cl), quest: questById.get(cl.questId) ?? null })),
  })
})
