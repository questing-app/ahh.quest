import { Hono, type Context } from 'hono'
import type { Env, AuthContext } from '../types'
import { authMiddleware } from '../middleware/auth'
import { createDbClient } from '../db/client'
import { claims, proofs, quests, verificationJobs } from '../db/schema'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { bytesToHex, fetchClaim, variant } from '@quest/sdk'
import { OracleService } from '../services/oracle.service'
import { recordApproved, recordRejected, recordReleased } from '../services/settlement.service'
import { getProgram } from '../lib/solana'
import { BadRequest, NotFound, Forbidden } from '../lib/errors'
import { pathParam } from '../lib/params'

export const claimRoutes = new Hono<{ Bindings: Env }>()

// Claim creation lives in quests.ts (POST /api/quests/:questId/claim).
// This router handles everything after a claim exists.

// POST /api/claims/:claimId/proof
claimRoutes.post('/:claimId/proof', authMiddleware, async (c) => {
  const auth = c.get('auth') as AuthContext
  const claimId = pathParam(c, 'claimId')
  const body = await c.req.json<{
    videoUrl: string
    videoHash: string
    durationSeconds?: number
  }>()

  const db = createDbClient(c.env)
  const claim = await db.select().from(claims).where(eq(claims.id, claimId)).get()

  if (!claim) throw new NotFound('Claim not found')
  if (claim.claimerId !== auth.userId) throw new Forbidden('Not your claim')
  if (claim.status !== 'active') throw new BadRequest('Claim is not active')

  if (!body.videoUrl || !/^[0-9a-f]{64}$/.test(body.videoHash ?? '')) {
    throw new BadRequest('videoUrl and a sha-256 videoHash are required')
  }

  // The claimer signed submit_proof with this video's hash before calling us.
  const quest = await db.select().from(quests).where(eq(quests.id, claim.questId)).get()
  if (!quest) throw new NotFound('Quest not found')
  const account = await fetchClaim(getProgram(c.env), quest.onchainId, auth.pubkey)
  if (!account || variant(account.status) !== 'submitted') {
    throw new BadRequest('Proof is not submitted on-chain')
  }
  if (!account.proofHash || bytesToHex(account.proofHash) !== body.videoHash) {
    throw new BadRequest('Video does not match the on-chain proof hash')
  }

  const now = Math.floor(Date.now() / 1000)
  // Create proof record
  const proofId = nanoid()
  const proof = {
    id: proofId,
    claimId,
    videoUrl: body.videoUrl,
    videoHash: body.videoHash,
    thumbnailUrl: null,
    durationSeconds: body.durationSeconds || 0,
    transcript: null,
    aiConfidence: null,
    aiDecision: null,
    aiReasoning: null,
    detectedActions: null,
    safetyFlags: null,
    finalDecision: null,
    decidedBy: null,
    oracleTxSig: null,
    createdAt: now,
  }

  await db.insert(proofs).values(proof)

  await db.update(claims)
    .set({ status: 'submitted', reviewDeadline: account.reviewDeadline?.toNumber() ?? null })
    .where(eq(claims.id, claimId))

  // Create verification job
  const jobId = nanoid()
  await db.insert(verificationJobs).values({
    id: jobId,
    proofId,
    status: 'pending',
    attempt: 1,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: now,
  })

  // Enqueue verification
  await c.env.VERIFICATION_QUEUE.send({ proofId })

  return c.json({
    id: proof.id,
    claimId: proof.claimId,
    videoUrl: proof.videoUrl,
    videoHash: proof.videoHash,
    thumbnailUrl: proof.thumbnailUrl,
    durationSeconds: proof.durationSeconds,
    createdAt: proof.createdAt,
  }, 201)
})

async function loadForReview(c: Context<{ Bindings: Env }>, claimId: string, userId: string) {
  const db = createDbClient(c.env)
  const claim = await db.select().from(claims).where(eq(claims.id, claimId)).get()
  if (!claim) throw new NotFound('Claim not found')
  if (claim.status !== 'submitted') throw new BadRequest('This attempt is already decided')

  const quest = await db.select().from(quests).where(eq(quests.id, claim.questId)).get()
  if (!quest) throw new NotFound('Quest not found')
  if (quest.creatorId !== userId) throw new Forbidden('Not your quest')

  return { db, claim, quest }
}

// POST /api/claims/:claimId/approve
claimRoutes.post('/:claimId/approve', authMiddleware, async (c) => {
  const auth = c.get('auth') as AuthContext
  const { db, claim, quest } = await loadForReview(c, pathParam(c, 'claimId'), auth.userId)

  const txSig = await new OracleService(c.env, db).approve(quest, claim)
  await recordApproved(db, quest, claim, 'creator', txSig)

  return c.json({ success: true, txSignature: txSig })
})

// POST /api/claims/:claimId/reject
claimRoutes.post('/:claimId/reject', authMiddleware, async (c) => {
  const auth = c.get('auth') as AuthContext
  const { db, claim, quest } = await loadForReview(c, pathParam(c, 'claimId'), auth.userId)

  const txSig = await new OracleService(c.env, db).reject(quest, claim, false)
  await recordRejected(db, quest, claim, 'creator', txSig, false)

  return c.json({ success: true, txSignature: txSig })
})

// DELETE /api/claims/:claimId
// The claimer signs abandon_claim first; this mirrors it.
claimRoutes.delete('/:claimId', authMiddleware, async (c) => {
  const auth = c.get('auth') as AuthContext
  const db = createDbClient(c.env)

  const claim = await db.select().from(claims).where(eq(claims.id, pathParam(c, 'claimId'))).get()
  if (!claim) throw new NotFound('Claim not found')
  if (claim.claimerId !== auth.userId) throw new Forbidden('Not your claim')
  if (claim.status !== 'active') throw new BadRequest('Claim is not active')

  const quest = await db.select().from(quests).where(eq(quests.id, claim.questId)).get()
  if (!quest) throw new NotFound('Quest not found')

  const account = await fetchClaim(getProgram(c.env), quest.onchainId, auth.pubkey)
  if (!account || variant(account.status) !== 'abandoned') {
    throw new BadRequest('Claim is not abandoned on-chain')
  }

  await recordReleased(db, quest, claim, 'abandoned')
  return c.body(null, 204)
})
