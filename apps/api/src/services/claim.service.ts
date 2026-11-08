import { eq, and, sql, inArray, gt } from 'drizzle-orm'
import { claimPda, fetchClaim, questPda, variant } from '@quest/sdk'
import { nanoid } from 'nanoid'
import { claims, quests, users } from '../db/schema'
import type { Database } from '../db/client'
import { getProgram } from '../lib/solana'
import { BadRequest } from '../lib/errors'
import type { Env } from '../types'

const MAX_ACTIVE_CLAIMS = 5

/**
 * Off-chain rules checked before the claimer signs: the contract enforces
 * status, ownership, targeting and stake, but not these.
 */
export async function validateClaim(db: Database, questId: string, claimerId: string, claimerPubkey: string) {
  const quest = await db.select().from(quests).where(eq(quests.id, questId)).get()
  if (!quest) return { error: 'Quest not found' }
  if (quest.status !== 'active') return { error: 'Quest is not active' }
  if (quest.currentClaimers >= quest.maxClaimers) return { error: 'Someone else is already on this quest' }
  if (quest.creatorId === claimerId) return { error: 'You can’t claim your own quest' }
  if (quest.questType === 'direct' && quest.targetPubkey !== claimerPubkey) {
    return { error: 'This quest was posted for someone else' }
  }

  const previous = await db.select({ id: claims.id }).from(claims)
    .where(and(eq(claims.questId, questId), eq(claims.claimerId, claimerId))).get()
  if (previous) return { error: 'You’ve already tried this quest' }

  const active = await db.select({ count: sql<number>`count(*)` }).from(claims)
    .where(and(eq(claims.claimerId, claimerId), eq(claims.status, 'active'))).get()
  if ((active?.count ?? 0) >= MAX_ACTIVE_CLAIMS) {
    return { error: `You can hold ${MAX_ACTIVE_CLAIMS} quests at once` }
  }

  const weekAgo = Math.floor(Date.now() / 1000) - 7 * 86400
  const dropped = await db.select({ count: sql<number>`count(*)` }).from(claims)
    .where(and(
      eq(claims.claimerId, claimerId),
      inArray(claims.status, ['expired', 'abandoned']),
      gt(claims.claimedAt, weekAgo),
    )).get()
  if ((dropped?.count ?? 0) >= 2) {
    return { error: 'You dropped two quests this week. Try again in a few days.' }
  }

  return { quest }
}

/** Records a claim the user already made on-chain, reading stake and deadline from the account. */
export async function recordClaim(
  db: Database,
  env: Env,
  quest: typeof quests.$inferSelect,
  claimerId: string,
  claimerPubkey: string,
  txSignature: string,
) {
  const account = await fetchClaim(getProgram(env), quest.onchainId, claimerPubkey)
  if (!account) throw new BadRequest('Claim not found on-chain')
  if (variant(account.status) !== 'active') throw new BadRequest('Claim is not active on-chain')

  const claim = {
    id: nanoid(),
    questId: quest.id,
    claimerId,
    status: 'active' as const,
    stakeAmount: account.stakeAmount.toNumber(),
    proofDeadline: account.proofDeadline.toNumber(),
    reviewDeadline: null,
    claimPda: claimPda(questPda(quest.onchainId), claimerPubkey).toBase58(),
    txSignature,
    claimedAt: account.claimedAt.toNumber(),
  }

  await db.insert(claims).values(claim)

  const currentClaimers = quest.currentClaimers + 1
  await db.update(quests)
    .set({ currentClaimers, status: currentClaimers >= quest.maxClaimers ? 'claimed' : 'active' })
    .where(eq(quests.id, quest.id))
  await db.update(users)
    .set({ activeClaims: sql`${users.activeClaims} + 1` })
    .where(eq(users.id, claimerId))

  return claim
}

export function formatClaim(claim: typeof claims.$inferSelect) {
  return {
    id: claim.id,
    questId: claim.questId,
    claimerId: claim.claimerId,
    status: claim.status,
    stakeAmount: claim.stakeAmount,
    proofDeadline: claim.proofDeadline,
    reviewDeadline: claim.reviewDeadline,
    claimedAt: claim.claimedAt,
  }
}
