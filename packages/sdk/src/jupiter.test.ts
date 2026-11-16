import { describe, expect, it, vi } from 'vitest'
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram } from '@solana/web3.js'
import { Buffer } from 'buffer'
import {
  CREATE_QUEST_COMPUTE_UNITS,
  WSOL_MINT,
  composeSwapThen,
  jupiterComputeUnits,
  priceImpactPercent,
  quoteSolToToken,
  swapInstructions,
  type JupiterQuote,
  type JupiterSwapInstructions,
  type RawInstruction,
} from './jupiter'

const MINT = 'E7Xfasv5CRTNc6Xb16w36BZk3HRSogh8T4ZFimSnpump'
const user = Keypair.generate().publicKey.toBase58()
const prog = (n: number) => new PublicKey(Buffer.alloc(32, n)).toBase58()

const raw = (programId: string, data: number[] = [9]): RawInstruction => ({
  programId,
  accounts: [{ pubkey: user, isSigner: true, isWritable: true }],
  data: Buffer.from(data).toString('base64'),
})

const asRaw = (ix: ReturnType<typeof ComputeBudgetProgram.setComputeUnitLimit>): RawInstruction => ({
  programId: ix.programId.toBase58(),
  accounts: [],
  data: Buffer.from(ix.data).toString('base64'),
})

const quote: JupiterQuote = {
  inputMint: WSOL_MINT,
  inAmount: '100000000',
  outputMint: MINT,
  outAmount: '243077970582',
  otherAmountThreshold: '240647190876',
  swapMode: 'ExactIn',
  slippageBps: 100,
  priceImpactPct: '0.0312',
  routePlan: [{ swapInfo: { label: 'Pump.fun Amm', ammKey: prog(7) }, percent: 100 }],
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

describe('jupiter quote', () => {
  it('asks for an exact-in SOL quote with the given slippage', async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) => ok(quote))
    const q = await quoteSolToToken({ outputMint: MINT, lamports: 100_000_000n, slippageBps: 50 }, f as never)
    expect(q.otherAmountThreshold).toBe('240647190876')
    const url = new URL(f.mock.calls[0][0])
    expect(Object.fromEntries(url.searchParams)).toEqual({
      inputMint: WSOL_MINT,
      outputMint: MINT,
      amount: '100000000',
      slippageBps: '50',
      swapMode: 'ExactIn',
    })
  })

  it('throws Jupiter’s own message when there is no route', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: 'No routes found' }), { status: 400 }))
    await expect(quoteSolToToken({ outputMint: MINT, lamports: 1 }, f as never)).rejects.toThrow('No routes found')
  })

  it('asks for swap instructions that wrap SOL for this user', async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) => ok({ swapInstruction: raw(prog(3)) }))
    await swapInstructions({ quote, user }, f as never)
    const body = JSON.parse(f.mock.calls[0][1]!.body as string)
    expect(body).toMatchObject({ userPublicKey: user, wrapAndUnwrapSol: true, quoteResponse: { outAmount: quote.outAmount } })
  })

  it('reports price impact as a percentage', () => {
    expect(priceImpactPercent(quote)).toBeCloseTo(3.12)
    expect(priceImpactPercent({ priceImpactPct: 'nonsense' })).toBe(0)
  })
})

describe('composeSwapThen', () => {
  const price = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1234 })
  const swap: JupiterSwapInstructions = {
    computeBudgetInstructions: [asRaw(ComputeBudgetProgram.setComputeUnitLimit({ units: 210_000 })), asRaw(price)],
    setupInstructions: [raw(prog(1))],
    swapInstruction: raw(prog(2)),
    cleanupInstruction: raw(prog(3)),
    otherInstructions: [],
    addressLookupTableAddresses: [prog(9)],
  }
  const createQuest = { programId: SystemProgram.programId, keys: [], data: Buffer.from([1]) }

  it('reads the swap’s compute units from its limit instruction', () => {
    expect(jupiterComputeUnits(swap)).toBe(210_000)
    expect(jupiterComputeUnits({ ...swap, computeUnitLimit: 300_000 })).toBe(300_000)
  })

  it('runs budget, setup, swap, cleanup, then the quest, with one raised limit', () => {
    const { instructions, lookupTables } = composeSwapThen(swap, [createQuest as never])
    expect(lookupTables).toEqual([prog(9)])
    expect(instructions.map((ix) => ix.programId.toBase58())).toEqual([
      ComputeBudgetProgram.programId.toBase58(),
      ComputeBudgetProgram.programId.toBase58(),
      prog(1),
      prog(2),
      prog(3),
      SystemProgram.programId.toBase58(),
    ])
    const limits = instructions.filter(
      (ix) => ix.programId.equals(ComputeBudgetProgram.programId) && ix.data[0] === 2,
    )
    expect(limits).toHaveLength(1)
    expect(Buffer.from(limits[0].data).readUInt32LE(1)).toBe(210_000 + CREATE_QUEST_COMPUTE_UNITS)
    expect(Buffer.from(instructions[1].data)).toEqual(Buffer.from(price.data))
  })

  it('caps the limit at the network maximum', () => {
    const big = { ...swap, computeUnitLimit: 1_390_000 }
    const limit = composeSwapThen(big, []).instructions[0]
    expect(Buffer.from(limit.data).readUInt32LE(1)).toBe(1_400_000)
  })
})

describe('questMemoIx', () => {
  it('writes QUESTING with the SPL Memo program and no signers', async () => {
    const { questMemoIx, MEMO_PROGRAM_ID } = await import('./jupiter')
    const ix = questMemoIx()
    expect(ix.programId.toBase58()).toBe('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')
    expect(ix.programId.equals(MEMO_PROGRAM_ID)).toBe(true)
    expect(ix.keys).toEqual([])
    expect(Buffer.from(ix.data).toString('utf8')).toBe('QUESTING')
  })
})
