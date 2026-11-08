import { inArray } from 'drizzle-orm'
import type { Connection, Keypair, PublicKey } from '@solana/web3.js'
import {
  approveIx,
  autoApproveIx,
  ensureAtaIx,
  expireIx,
  fetchConfig,
  rejectIx,
  tokenProgramOf,
  type QuestProgram,
} from '@quest/sdk'
import { users, type quests, type claims } from '../db/schema'
import type { Database } from '../db/client'
import { getConnection, getOracleKeypair, getProgram, sendAndConfirm } from '../lib/solana'
import type { Env } from '../types'

type Quest = typeof quests.$inferSelect
type Claim = typeof claims.$inferSelect

/**
 * Signs settlement transactions as the protocol authority (config.authority).
 * Expire and auto-approve are permissionless on-chain; the oracle just pays for them.
 */
export class OracleService {
  private connection: Connection
  private program: QuestProgram
  private keypair: Keypair
  private treasury?: PublicKey

  constructor(env: Env, private db: Database) {
    this.connection = getConnection(env)
    this.program = getProgram(env)
    this.keypair = getOracleKeypair(env)
  }

  async approve(quest: Quest, claim: Claim, auto = false): Promise<string> {
    const { claimer } = await this.parties(quest, claim)
    const treasury = await this.treasuryWallet()
    const base = { questId: quest.onchainId, claimer, mint: quest.rewardMint, treasury }
    const ix = auto
      ? await autoApproveIx(this.program, { ...base, cranker: this.keypair.publicKey })
      : await approveIx(this.program, { ...base, authority: this.keypair.publicKey })
    const tp = await tokenProgramOf(this.connection, quest.rewardMint)
    return this.send([ensureAtaIx(this.keypair.publicKey, treasury, quest.rewardMint, tp), ix])
  }

  async reject(quest: Quest, claim: Claim, safetyFlagged: boolean): Promise<string> {
    const { claimer, creator } = await this.parties(quest, claim)
    const ix = await rejectIx(this.program, {
      questId: quest.onchainId,
      claimer,
      creator,
      mint: quest.rewardMint,
      authority: this.keypair.publicKey,
      safetyFlagged,
    })
    return this.send([ix])
  }

  async expire(quest: Quest, claim: Claim): Promise<string> {
    const { claimer, creator } = await this.parties(quest, claim)
    const ix = await expireIx(this.program, {
      questId: quest.onchainId,
      claimer,
      creator,
      mint: quest.rewardMint,
      cranker: this.keypair.publicKey,
    })
    return this.send([ix])
  }

  private send(ixs: Parameters<typeof sendAndConfirm>[2]) {
    return sendAndConfirm(this.connection, this.keypair, ixs)
  }

  private async treasuryWallet(): Promise<PublicKey> {
    if (!this.treasury) {
      const config = await fetchConfig(this.program)
      if (!config) throw new Error('Quest program is not initialized on this cluster')
      this.treasury = config.treasury
    }
    return this.treasury
  }

  private async parties(quest: Quest, claim: Claim) {
    const rows = await this.db.select({ id: users.id, pubkey: users.pubkey })
      .from(users)
      .where(inArray(users.id, [quest.creatorId, claim.claimerId]))
      .all()
    const pubkey = (id: string) => {
      const row = rows.find((r) => r.id === id)
      if (!row) throw new Error(`User ${id} not found`)
      return row.pubkey
    }
    return { creator: pubkey(quest.creatorId), claimer: pubkey(claim.claimerId) }
  }
}
