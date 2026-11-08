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

export const devRoutes = new Hono<{ Bindings: Env }>()

devRoutes.post('/faucet', authMiddleware, async (c) => {
  if (!c.env.SOLANA_RPC_URL.includes('devnet')) throw new Forbidden('Faucet is devnet only')
  const auth = c.get('auth') as AuthContext

  const key = `faucet:${auth.pubkey}`
  if (await c.env.RATE_LIMIT_KV.get(key)) throw new RateLimited('Faucet is once a day')

  const oracle = getOracleKeypair(c.env)
  const owner = new PublicKey(auth.pubkey)
  const mint = new PublicKey(c.env.QUEST_MINT)
  const connection = getConnection(c.env)
  const tp = await tokenProgramOf(connection, mint)

  const txSignature = await sendAndConfirm(connection, oracle, [
    SystemProgram.transfer({ fromPubkey: oracle.publicKey, toPubkey: owner, lamports: SOL_DRIP }),
    ensureAtaIx(oracle.publicKey, owner, mint, tp),
    createMintToInstruction(mint, ata(mint, owner, tp), oracle.publicKey, QUEST_DRIP, [], tp),
  ])

  await c.env.RATE_LIMIT_KV.put(key, '1', { expirationTtl: 86400 })
  return c.json({ txSignature, sol: SOL_DRIP / LAMPORTS_PER_SOL, quest: Number(QUEST_DRIP / 1_000_000n) })
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
