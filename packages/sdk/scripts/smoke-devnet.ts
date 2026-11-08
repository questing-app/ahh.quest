// Runs one quest through its whole life on devnet: create, claim, prove,
// approve. The deployer posts and acts as oracle; a fresh keypair claims.
// Usage: pnpm --filter @quest/sdk smoke-devnet
import { readFileSync } from 'node:fs'
import {
  Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction,
  sendAndConfirmTransaction, type TransactionInstruction,
} from '@solana/web3.js'
import { createMintToInstruction } from '@solana/spl-token'
import {
  approveIx, ata, claimQuestIx, createQuestIx, ensureAtaIx, fetchClaim, fetchConfig,
  fetchQuest, questProgram, sha256, submitProofIx, tokenProgramOf, variant,
} from '../src'

const load = (name: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(
  readFileSync(new URL(`../../../contracts/.keys/${name}.json`, import.meta.url), 'utf8'))))
const deployer = load('deployer')
const mint = load('quest-mint').publicKey
const claimer = Keypair.generate()
const connection = new Connection(process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com', 'confirmed')
const program = questProgram(connection)
const tp = await tokenProgramOf(connection, mint)
const send = (ixs: TransactionInstruction[], signers: Keypair[]) =>
  sendAndConfirmTransaction(connection, new Transaction().add(...ixs), signers)
const balance = async (owner: PublicKey) =>
  Number((await connection.getTokenAccountBalance(ata(mint, owner, tp))).value.amount) / 1e6

const reward = 10_000_000n
await send([
  SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: claimer.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL }),
  ensureAtaIx(deployer.publicKey, deployer.publicKey, mint, tp),
  ensureAtaIx(deployer.publicKey, claimer.publicKey, mint, tp),
  createMintToInstruction(mint, ata(mint, deployer.publicKey, tp), deployer.publicKey, 100_000_000n, [], tp),
  createMintToInstruction(mint, ata(mint, claimer.publicKey, tp), deployer.publicKey, 1_000_000n, [], tp),
], [deployer])
console.log('token program', tp.toBase58())
console.log('funded claimer', claimer.publicKey.toBase58())

const questId = (await fetchConfig(program))!.questCount.toString()
await send([await createQuestIx(program, {
  creator: deployer.publicKey, questId, mint, rewardAmount: reward,
  descriptionHash: await sha256('Smoke test: wave at the camera'),
})], [deployer])
console.log('created quest', questId, variant((await fetchQuest(program, questId))!.status))

await send([await claimQuestIx(program, { claimer: claimer.publicKey, questId, mint, stakeAmount: 500_000n })], [claimer])
console.log('claimed', variant((await fetchClaim(program, questId, claimer.publicKey))!.status))

await send([await submitProofIx(program, { claimer: claimer.publicKey, questId, proofHash: await sha256('video bytes') })], [claimer])
console.log('proof', variant((await fetchClaim(program, questId, claimer.publicKey))!.status))

const before = await balance(claimer.publicKey)
await send([await approveIx(program, {
  questId, claimer: claimer.publicKey, mint, authority: deployer.publicKey, treasury: deployer.publicKey,
})], [deployer])
const quest = (await fetchQuest(program, questId))!
console.log('approved', variant(quest.status), 'claimer received', (await balance(claimer.publicKey)) - before, 'QUEST')
