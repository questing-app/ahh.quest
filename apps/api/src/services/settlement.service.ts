import { eq, sql } from 'drizzle-orm'
import { claims, proofs, quests, users } from '../db/schema'
import type { Database } from '../db/client'
import type { Env } from '../types'
import { excerpt, notify } from './push.service'

type Quest = typeof quests.$inferSelect
type Claim = typeof claims.$inferSelect
type DecidedBy = 'ai' | 'creator' | 'timeout'

const now = () => Math.floor(Date.now() / 1000)

// DB mirrors of on-chain transitions. Call these only after the matching
// transaction has confirmed, so the database never runs ahead of the escrow.
// Each one stamps when it happened and tells the people it affects.

export async function recordApproved(
  db: Database, env: Env, quest: Quest, claim: Claim, decidedBy: DecidedBy, txSig: string,
) {
  const at = now()
  await db.update(proofs)
    .set({ finalDecision: 'approved', decidedBy, oracleTxSig: txSig })
    .where(eq(proofs.claimId, claim.id))
  await db.update(claims).set({ status: 'approved', settledAt: at }).where(eq(claims.id, claim.id))
  await db.update(quests).set({ status: 'completed', closedAt: at }).where(eq(quests.id, quest.id))
  await db.update(users)
    .set({
      questsCompleted: sql`${users.questsCompleted} + 1`,
      activeClaims: sql`max(${users.activeClaims} - 1, 0)`,
    })
    .where(eq(users.id, claim.claimerId))

  const what = excerpt(quest.description)
  notify(env, db, claim.claimerId, {
    title: 'You got paid',
    body: `“${what}” was approved. The reward and your deposit are in your wallet.`,
    url: `/q/${quest.id}`,
  })
  if (decidedBy !== 'creator') {
    notify(env, db, quest.creatorId, {
      title: 'Your quest paid out',
      body: decidedBy === 'timeout'
        ? `Nobody reviewed “${what}” in 24 hours, so it approved itself.`
        : `The video check approved “${what}”.`,
      url: `/q/${quest.id}`,
    })
  }
}

export async function recordRejected(
  db: Database, env: Env, quest: Quest, claim: Claim, decidedBy: DecidedBy, txSig: string, safetyFlagged: boolean,
  reason: string | null = null,
) {
  const at = now()
  await db.update(proofs)
    .set({ finalDecision: 'rejected', decidedBy, oracleTxSig: txSig, rejectReason: reason })
    .where(eq(proofs.claimId, claim.id))
  await db.update(claims).set({ status: 'rejected', settledAt: at }).where(eq(claims.id, claim.id))
  await db.update(quests).set({ status: 'failed', closedAt: at }).where(eq(quests.id, quest.id))
  await db.update(users)
    .set({
      activeClaims: sql`max(${users.activeClaims} - 1, 0)`,
      ...(safetyFlagged ? { flags: sql`${users.flags} + 1` } : {}),
    })
    .where(eq(users.id, claim.claimerId))

  const what = excerpt(quest.description)
  notify(env, db, claim.claimerId, {
    title: 'Your video was rejected',
    body: reason ? `“${what}”: ${excerpt(reason, 90)}` : `“${what}” didn’t pass. Open it to see why.`,
    url: `/q/${quest.id}`,
  })
  if (decidedBy !== 'creator') {
    notify(env, db, quest.creatorId, {
      title: 'A video was rejected',
      body: `The video check turned down the attempt at “${what}”. Your reward is back in your wallet.`,
      url: `/q/${quest.id}`,
    })
  }
}

/** Expired or abandoned: the stake went to the creator and the quest reopens. */
export async function recordReleased(
  db: Database, env: Env, quest: Quest, claim: Claim, status: 'expired' | 'abandoned',
) {
  await db.update(claims).set({ status, settledAt: now() }).where(eq(claims.id, claim.id))
  await db.update(quests)
    .set({
      currentClaimers: Math.max(0, quest.currentClaimers - 1),
      status: quest.status === 'claimed' ? 'active' : quest.status,
    })
    .where(eq(quests.id, quest.id))
  await db.update(users)
    .set({ activeClaims: sql`max(${users.activeClaims} - 1, 0)` })
    .where(eq(users.id, claim.claimerId))

  const what = excerpt(quest.description)
  if (status === 'expired') {
    notify(env, db, claim.claimerId, {
      title: 'Time ran out',
      body: `No video arrived for “${what}” in 24 hours, so your deposit went to the poster.`,
      url: `/q/${quest.id}`,
    })
  }
  notify(env, db, quest.creatorId, {
    title: 'Your quest is open again',
    body: status === 'expired'
      ? `Nobody sent a video for “${what}” in time. You keep their deposit.`
      : `The person on “${what}” gave up. You keep their deposit.`,
    url: `/q/${quest.id}`,
  })
}
