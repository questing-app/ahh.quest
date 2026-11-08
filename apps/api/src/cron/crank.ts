import { and, eq, lt, isNotNull } from 'drizzle-orm'
import { claims, quests } from '../db/schema'
import { createDbClient } from '../db/client'
import { OracleService } from '../services/oracle.service'
import { recordApproved, recordReleased } from '../services/settlement.service'
import type { Env } from '../types'

// Runs every 5 minutes. Both instructions are permissionless on-chain, so the
// oracle only pays the fee. The DB changes only after the transaction lands.
export async function runCrank(env: Env): Promise<void> {
  const db = createDbClient(env)
  const oracle = new OracleService(env, db)
  const now = Math.floor(Date.now() / 1000)

  const overdue = await db.select().from(claims)
    .where(and(eq(claims.status, 'active'), lt(claims.proofDeadline, now)))
    .all()

  for (const claim of overdue) {
    const quest = await db.select().from(quests).where(eq(quests.id, claim.questId)).get()
    if (!quest) continue
    try {
      await oracle.expire(quest, claim)
      await recordReleased(db, quest, claim, 'expired')
    } catch (err) {
      console.error(`expire_claim failed for ${claim.id}:`, err)
    }
  }

  const unreviewed = await db.select().from(claims)
    .where(and(
      eq(claims.status, 'submitted'),
      isNotNull(claims.reviewDeadline),
      lt(claims.reviewDeadline, now),
    ))
    .all()

  for (const claim of unreviewed) {
    const quest = await db.select().from(quests).where(eq(quests.id, claim.questId)).get()
    if (!quest) continue
    try {
      const txSig = await oracle.approve(quest, claim, true)
      await recordApproved(db, quest, claim, 'timeout', txSig)
    } catch (err) {
      console.error(`auto_approve failed for ${claim.id}:`, err)
    }
  }
}
