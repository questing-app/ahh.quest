import { BN, Program, type Provider } from '@coral-xyz/anchor'
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { Connection, PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js'
import { Buffer } from 'buffer'
import idl from './idl/quest.json'
import type { Quest as QuestIdl } from './idl/quest'

export type { QuestIdl }
export type QuestProgram = Program<QuestIdl>

export const PROGRAM_ID = new PublicKey(idl.address)
export const PROGRAM_ERRORS: { code: number; msg: string }[] = idl.errors

type Amount = bigint | number | string
type Key = PublicKey | string

const bn = (v: Amount) => new BN(v.toString())
const key = (k: Key) => (typeof k === 'string' ? new PublicKey(k) : k)

export function questProgram(connection: Connection): QuestProgram {
  return new Program(idl as QuestIdl, { connection } as Provider)
}

// PDAs, matching the seeds in contracts/programs/quest/src/lib.rs

export function configPda(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM_ID)[0]
}

export function questPda(questId: Amount): PublicKey {
  const id = Buffer.alloc(8)
  id.writeBigUInt64LE(BigInt(questId.toString()))
  return PublicKey.findProgramAddressSync([Buffer.from('quest'), id], PROGRAM_ID)[0]
}

export function escrowPda(quest: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('escrow'), quest.toBuffer()], PROGRAM_ID)[0]
}

export function claimPda(quest: PublicKey, claimer: Key): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('claim'), quest.toBuffer(), key(claimer).toBuffer()],
    PROGRAM_ID,
  )[0]
}

// $QUEST is a Token-2022 mint (pump.fun), so that's the default. The program accepts
// either token program; instruction builders look up the mint's owner to be sure.
export const DEFAULT_TOKEN_PROGRAM = TOKEN_2022_PROGRAM_ID

export function ata(mint: Key, owner: Key, tokenProgram: Key = DEFAULT_TOKEN_PROGRAM): PublicKey {
  return getAssociatedTokenAddressSync(key(mint), key(owner), true, key(tokenProgram))
}

export function ensureAtaIx(
  payer: Key,
  owner: Key,
  mint: Key,
  tokenProgram: Key = DEFAULT_TOKEN_PROGRAM,
): TransactionInstruction {
  return createAssociatedTokenAccountIdempotentInstruction(
    key(payer),
    ata(mint, owner, tokenProgram),
    key(owner),
    key(mint),
    key(tokenProgram),
  )
}

const mintPrograms = new Map<string, PublicKey>()

/** The token program that owns `mint` (legacy SPL or Token-2022). Cached per mint. */
export async function tokenProgramOf(connection: Connection, mint: Key): Promise<PublicKey> {
  const id = key(mint).toBase58()
  const cached = mintPrograms.get(id)
  if (cached) return cached
  const info = await connection.getAccountInfo(key(mint))
  if (!info) throw new Error(`Mint ${id} not found`)
  if (!info.owner.equals(TOKEN_PROGRAM_ID) && !info.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    throw new Error(`${id} is not a token mint`)
  }
  mintPrograms.set(id, info.owner)
  return info.owner
}

const tokenProgramFor = (program: QuestProgram, mint: Key) =>
  tokenProgramOf(program.provider.connection, mint)

export async function sha256(data: string | Uint8Array): Promise<number[]> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  return Array.from(new Uint8Array(digest))
}

export function hexToBytes(hex: string): number[] {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('Expected a 32-byte hex hash')
  return Array.from({ length: 32 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16))
}

export function bytesToHex(bytes: ArrayLike<number>): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Anchor decodes Rust enums as `{ variant: {} }`. */
export function variant(value: object): string {
  return Object.keys(value)[0]
}

// Account reads

export async function fetchConfig(program: QuestProgram) {
  return program.account.questConfig.fetchNullable(configPda())
}

export async function fetchQuest(program: QuestProgram, questId: Amount) {
  return program.account.quest.fetchNullable(questPda(questId))
}

export async function fetchClaim(program: QuestProgram, questId: Amount, claimer: Key) {
  return program.account.claim.fetchNullable(claimPda(questPda(questId), claimer))
}

// Instructions

export function initializeIx(
  program: QuestProgram,
  a: { authority: Key; treasury: Key; feeBps: number; burnBps: number },
) {
  return program.methods
    .initialize(a.feeBps, a.burnBps)
    .accountsStrict({
      config: configPda(),
      treasury: key(a.treasury),
      authority: key(a.authority),
      systemProgram: SystemProgram.programId,
    })
    .instruction()
}

export async function createQuestIx(
  program: QuestProgram,
  a: {
    creator: Key
    questId: Amount
    mint: Key
    rewardAmount: Amount
    target?: Key | null
    /** Unix seconds after which the quest can no longer be claimed. */
    timeLimit?: number | null
    descriptionHash: number[]
  },
) {
  const quest = questPda(a.questId)
  const tp = await tokenProgramFor(program, a.mint)
  const target = a.target ? key(a.target) : null
  return program.methods
    .createQuest(
      bn(a.rewardAmount),
      target ? { direct: {} } : { open: {} },
      target,
      1,
      a.timeLimit ? new BN(a.timeLimit) : null,
      a.descriptionHash,
    )
    .accountsStrict({
      config: configPda(),
      quest,
      escrow: escrowPda(quest),
      rewardMint: key(a.mint),
      creator: key(a.creator),
      creatorTokenAccount: ata(a.mint, a.creator, tp),
      tokenProgram: tp,
      systemProgram: SystemProgram.programId,
    })
    .instruction()
}

export async function claimQuestIx(
  program: QuestProgram,
  a: { claimer: Key; questId: Amount; mint: Key; stakeAmount: Amount },
) {
  const quest = questPda(a.questId)
  const tp = await tokenProgramFor(program, a.mint)
  return program.methods
    .claimQuest(bn(a.stakeAmount))
    .accountsStrict({
      quest,
      claim: claimPda(quest, a.claimer),
      escrow: escrowPda(quest),
      claimer: key(a.claimer),
      claimerTokenAccount: ata(a.mint, a.claimer, tp),
      rewardMint: key(a.mint),
      tokenProgram: tp,
      systemProgram: SystemProgram.programId,
    })
    .instruction()
}

export function submitProofIx(
  program: QuestProgram,
  a: { claimer: Key; questId: Amount; proofHash: number[] },
) {
  const quest = questPda(a.questId)
  return program.methods
    .submitProof(a.proofHash)
    .accountsStrict({ quest, claim: claimPda(quest, a.claimer), claimer: key(a.claimer) })
    .instruction()
}

export async function cancelQuestIx(program: QuestProgram, a: { creator: Key; questId: Amount; mint: Key }) {
  const quest = questPda(a.questId)
  const tp = await tokenProgramFor(program, a.mint)
  return program.methods
    .cancelQuest()
    .accountsStrict({
      quest,
      escrow: escrowPda(quest),
      creator: key(a.creator),
      creatorTokenAccount: ata(a.mint, a.creator, tp),
      rewardMint: key(a.mint),
      tokenProgram: tp,
    })
    .instruction()
}

export async function abandonClaimIx(
  program: QuestProgram,
  a: { claimer: Key; creator: Key; questId: Amount; mint: Key },
) {
  const quest = questPda(a.questId)
  const tp = await tokenProgramFor(program, a.mint)
  return program.methods
    .abandonClaim()
    .accountsStrict({
      quest,
      claim: claimPda(quest, a.claimer),
      escrow: escrowPda(quest),
      creatorTokenAccount: ata(a.mint, a.creator, tp),
      claimer: key(a.claimer),
      rewardMint: key(a.mint),
      tokenProgram: tp,
    })
    .instruction()
}

type Settlement = { questId: Amount; claimer: Key; mint: Key }

export async function approveIx(program: QuestProgram, a: Settlement & { authority: Key; treasury: Key }) {
  const quest = questPda(a.questId)
  const tp = await tokenProgramFor(program, a.mint)
  return program.methods
    .approveCompletion()
    .accountsStrict({
      config: configPda(),
      quest,
      claim: claimPda(quest, a.claimer),
      escrow: escrowPda(quest),
      claimerTokenAccount: ata(a.mint, a.claimer, tp),
      treasury: ata(a.mint, a.treasury, tp),
      authority: key(a.authority),
      rewardMint: key(a.mint),
      tokenProgram: tp,
    })
    .instruction()
}

export async function autoApproveIx(program: QuestProgram, a: Settlement & { cranker: Key; treasury: Key }) {
  const quest = questPda(a.questId)
  const tp = await tokenProgramFor(program, a.mint)
  return program.methods
    .autoApprove()
    .accountsStrict({
      config: configPda(),
      quest,
      claim: claimPda(quest, a.claimer),
      escrow: escrowPda(quest),
      claimerTokenAccount: ata(a.mint, a.claimer, tp),
      treasury: ata(a.mint, a.treasury, tp),
      cranker: key(a.cranker),
      rewardMint: key(a.mint),
      tokenProgram: tp,
    })
    .instruction()
}

export async function rejectIx(
  program: QuestProgram,
  a: Settlement & { authority: Key; creator: Key; safetyFlagged: boolean },
) {
  const quest = questPda(a.questId)
  const tp = await tokenProgramFor(program, a.mint)
  return program.methods
    .rejectCompletion(a.safetyFlagged)
    .accountsStrict({
      config: configPda(),
      quest,
      claim: claimPda(quest, a.claimer),
      escrow: escrowPda(quest),
      creatorTokenAccount: ata(a.mint, a.creator, tp),
      claimerTokenAccount: ata(a.mint, a.claimer, tp),
      authority: key(a.authority),
      rewardMint: key(a.mint),
      tokenProgram: tp,
    })
    .instruction()
}

export async function expireIx(program: QuestProgram, a: Settlement & { cranker: Key; creator: Key }) {
  const quest = questPda(a.questId)
  const tp = await tokenProgramFor(program, a.mint)
  return program.methods
    .expireClaim()
    .accountsStrict({
      quest,
      claim: claimPda(quest, a.claimer),
      escrow: escrowPda(quest),
      creatorTokenAccount: ata(a.mint, a.creator, tp),
      cranker: key(a.cranker),
      rewardMint: key(a.mint),
      tokenProgram: tp,
    })
    .instruction()
}
