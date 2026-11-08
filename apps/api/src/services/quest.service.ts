import { eq, desc, and, sql, inArray } from 'drizzle-orm'
import { bytesToHex, escrowPda, fetchQuest, questPda, variant } from '@quest/sdk'
import { nanoid } from 'nanoid'
import { quests, users } from '../db/schema'
import type { Database } from '../db/client'
import { getProgram } from '../lib/solana'
import { BadRequest } from '../lib/errors'
import type { Env } from '../types'

export interface CreateQuestInput {
  creatorId: string
  creatorPubkey: string
  description: string
  onchainId: string
  txSignature: string
}

/**
 * The client creates and funds the quest on-chain first. Everything we store
 * (reward, mint, target, deadline) is read back from the quest account, and
 * the description must hash to the account's description_hash.
 */
export async function createQuest(db: Database, env: Env, input: CreateQuestInput) {
  if (!/^\d+$/.test(input.onchainId)) throw new BadRequest('Invalid onchainId')

  const existing = await db.select({ id: quests.id }).from(quests)
    .where(eq(quests.onchainId, input.onchainId)).get()
  if (existing) throw new BadRequest('Quest already recorded')

  const account = await fetchQuest(getProgram(env), input.onchainId)
  if (!account) throw new BadRequest('Quest account not found on-chain')
  if (account.creator.toBase58() !== input.creatorPubkey) throw new BadRequest('Quest was created by another wallet')
  if (variant(account.status) !== 'active') throw new BadRequest('Quest is not active on-chain')

  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input.description))
  const descriptionHash = bytesToHex(new Uint8Array(hashBuffer))
  if (descriptionHash !== bytesToHex(account.descriptionHash)) {
    throw new BadRequest('Description does not match the on-chain hash')
  }

  const quest = {
    id: nanoid(),
    onchainId: input.onchainId,
    creatorId: input.creatorId,
    description: input.description,
    descriptionHash,
    questType: variant(account.questType) === 'direct' ? 'direct' as const : 'open' as const,
    status: 'active' as const,
    rewardAmount: account.rewardAmount.toNumber(),
    rewardMint: account.rewardMint.toBase58(),
    targetPubkey: account.target?.toBase58() ?? null,
    maxClaimers: account.maxClaimers,
    currentClaimers: 0,
    deadline: account.timeLimit?.toNumber() ?? null,
    escrowPda: escrowPda(questPda(input.onchainId)).toBase58(),
    questPda: questPda(input.onchainId).toBase58(),
    txSignature: input.txSignature,
    createdAt: account.createdAt.toNumber(),
  }

  await db.insert(quests).values(quest)
  await db.update(users)
    .set({ questsPosted: sql`${users.questsPosted} + 1` })
    .where(eq(users.id, input.creatorId))

  return quest
}

export async function getQuestById(db: Database, id: string) {
  return db.select().from(quests).where(eq(quests.id, id)).get()
}

export async function listQuests(
  db: Database,
  filters: {
    status?: string
    questType?: string
    creator?: string
    limit?: number
    offset?: number
  },
) {
  const conditions = []

  if (filters.status) {
    conditions.push(eq(quests.status, filters.status as any))
  }
  if (filters.questType) {
    conditions.push(eq(quests.questType, filters.questType as any))
  }
  if (filters.creator) {
    conditions.push(eq(quests.creatorId, filters.creator))
  }

  const limit = Math.min(filters.limit || 20, 50)
  const offset = filters.offset || 0

  const where = conditions.length > 0 ? and(...conditions) : undefined

  return db.select()
    .from(quests)
    .where(where)
    .orderBy(desc(quests.createdAt))
    .limit(limit)
    .offset(offset)
    .all()
}

export function formatQuest(quest: typeof quests.$inferSelect) {
  return {
    id: quest.id,
    onchainId: quest.onchainId,
    creatorId: quest.creatorId,
    description: quest.description,
    questType: quest.questType,
    status: quest.status,
    rewardAmount: quest.rewardAmount,
    rewardMint: quest.rewardMint,
    targetPubkey: quest.targetPubkey,
    maxClaimers: quest.maxClaimers,
    currentClaimers: quest.currentClaimers,
    deadline: quest.deadline,
    escrowPda: quest.escrowPda,
    txSignature: quest.txSignature,
    createdAt: quest.createdAt,
  }
}

type QuestRow = typeof quests.$inferSelect

// Feed and detail screens show who posted each quest, so attach a slim
// creator record instead of making the client fetch users one by one.
export async function formatQuestsWithCreators(db: Database, rows: QuestRow[]) {
  const ids = [...new Set(rows.map((q) => q.creatorId))]
  const creators = ids.length
    ? await db.select({
        id: users.id,
        username: users.username,
        pubkey: users.pubkey,
        avatarUrl: users.avatarUrl,
      }).from(users).where(inArray(users.id, ids)).all()
    : []
  const byId = new Map(creators.map((u) => [u.id, u]))

  return rows.map((q) => ({
    ...formatQuest(q),
    creator: byId.get(q.creatorId) ?? null,
  }))
}
