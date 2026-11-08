import { eq, sql } from 'drizzle-orm'
import { claims, proofs, quests, users } from '../db/schema'
import type { Database } from '../db/client'

type Quest = typeof quests.$inferSelect
type Claim = typeof claims.$inferSelect
type DecidedBy = 'ai' | 'creator' | 'timeout'

// DB mirrors of on-chain transitions. Call these only after the matching
// transaction has confirmed, so the database never runs ahead of the escrow.

export async function recordApproved(
  db: Database, quest: Quest, claim: Claim, decidedBy: DecidedBy, txSig: string,
) {
  await db.update(proofs)
    .set({ finalDecision: 'approved', decidedBy, oracleTxSig: txSig })
    .where(eq(proofs.claimId, claim.id))
  await db.update(claims).set({ status: 'approved' }).where(eq(claims.id, claim.id))
  await db.update(quests).set({ status: 'completed' }).where(eq(quests.id, quest.id))
  await db.update(users)
    .set({
      questsCompleted: sql`${users.questsCompleted} + 1`,
      activeClaims: sql`max(${users.activeClaims} - 1, 0)`,
    })
    .where(eq(users.id, claim.claimerId))
}

export async function recordRejected(
  db: Database, quest: Quest, claim: Claim, decidedBy: DecidedBy, txSig: string, safetyFlagged: boolean,
) {
  await db.update(proofs)
    .set({ finalDecision: 'rejected', decidedBy, oracleTxSig: txSig })
    .where(eq(proofs.claimId, claim.id))
  await db.update(claims).set({ status: 'rejected' }).where(eq(claims.id, claim.id))
  await db.update(quests).set({ status: 'failed' }).where(eq(quests.id, quest.id))
  await db.update(users)
    .set({
      activeClaims: sql`max(${users.activeClaims} - 1, 0)`,
      ...(safetyFlagged ? { flags: sql`${users.flags} + 1` } : {}),
    })
    .where(eq(users.id, claim.claimerId))
}

/** Expired or abandoned: the stake went to the creator and the quest reopens. */
export async function recordReleased(
  db: Database, quest: Quest, claim: Claim, status: 'expired' | 'abandoned',
) {
  await db.update(claims).set({ status }).where(eq(claims.id, claim.id))
  await db.update(quests)
    .set({
      currentClaimers: Math.max(0, quest.currentClaimers - 1),
      status: quest.status === 'claimed' ? 'active' : quest.status,
    })
    .where(eq(quests.id, quest.id))
  await db.update(users)
    .set({ activeClaims: sql`max(${users.activeClaims} - 1, 0)` })
    .where(eq(users.id, claim.claimerId))
}
