import { Hono } from 'hono'
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from '@solana/web3.js'
import { createMintToInstruction } from '@solana/spl-token'
import { PROGRAM_ID, ata, ensureAtaIx, fetchConfig, tokenProgramOf } from '@quest/sdk'
import type { Env, AuthContext } from '../types'
import { authMiddleware } from '../middleware/auth'
import { getConnection, getOracleKeypair, getProgram, sendAndConfirm } from '../lib/solana'
import { Forbidden, RateLimited } from '../lib/errors'

// Devnet only. The oracle wallet is also the test mint's authority, so it can
// hand out SOL for fees and QUEST to post and stake with.
const SOL_DRIP = 0.05 * LAMPORTS_PER_SOL
const QUEST_DRIP = 1_000n * 1_000_000n
const MAX_TOP_UP = 1_000_000n * 1_000_000n

export const devRoutes = new Hono<{ Bindings: Env }>()

// POST /api/dev/faucet
//   {}                  daily drip: some SOL for fees and 1,000 test QUEST
//   { amount: units }   top-up for testing: mints exactly that much QUEST (no daily limit)
devRoutes.post('/faucet', authMiddleware, async (c) => {
  if (!c.env.SOLANA_RPC_URL.includes('devnet')) throw new Forbidden('Faucet is devnet only')
  const auth = c.get('auth') as AuthContext
  const body = await c.req.json().catch(() => ({})) as { amount?: unknown }
  const topUp = typeof body.amount === 'number' && Number.isFinite(body.amount) && body.amount > 0
    ? BigInt(Math.min(Math.ceil(body.amount), Number(MAX_TOP_UP)))
    : null

  const key = `faucet:${auth.pubkey}`
  if (!topUp && await c.env.RATE_LIMIT_KV.get(key)) throw new RateLimited('Faucet is once a day')

  const oracle = getOracleKeypair(c.env)
  const owner = new PublicKey(auth.pubkey)
  const mint = new PublicKey(c.env.QUEST_MINT)
  const connection = getConnection(c.env)
  const tp = await tokenProgramOf(connection, mint)
  // Only send SOL when they're short of fees, so top-ups don't drain the oracle.
  const needsSol = !topUp || (await connection.getBalance(owner)) < SOL_DRIP / 2

  const txSignature = await sendAndConfirm(connection, oracle, [
    ...(needsSol ? [SystemProgram.transfer({ fromPubkey: oracle.publicKey, toPubkey: owner, lamports: SOL_DRIP })] : []),
    ensureAtaIx(oracle.publicKey, owner, mint, tp),
    createMintToInstruction(mint, ata(mint, owner, tp), oracle.publicKey, topUp ?? QUEST_DRIP, [], tp),
  ])

  if (!topUp) await c.env.RATE_LIMIT_KV.put(key, '1', { expirationTtl: 86400 })
  return c.json({
    txSignature,
    sol: needsSol ? SOL_DRIP / LAMPORTS_PER_SOL : 0,
    quest: Number((topUp ?? QUEST_DRIP)) / 1_000_000,
  })
})

devRoutes.get('/chain', async (c) => {
  const config = await fetchConfig(getProgram(c.env))
  return c.json({
    programId: PROGRAM_ID.toBase58(),
    initialized: !!config,
    questCount: config?.questCount.toString() ?? null,
    authority: config?.authority.toBase58() ?? null,
  })
})
