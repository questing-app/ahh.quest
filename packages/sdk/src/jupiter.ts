import { ComputeBudgetProgram, PublicKey, TransactionInstruction } from '@solana/web3.js'
import { Buffer } from 'buffer'

// Buying the reward token with SOL through Jupiter, so a quest can be funded
// from SOL in the same transaction that creates it.

export const JUPITER_API = 'https://lite-api.jup.ag/swap/v1'
export const WSOL_MINT = 'So11111111111111111111111111111111111111112'
export const DEFAULT_SLIPPAGE_BPS = 100
/** Above this the UI warns that the trade moves the price a lot. */
export const HIGH_PRICE_IMPACT_PCT = 3
/** Room for create_quest (two account inits plus a token transfer) on top of the swap. */
export const CREATE_QUEST_COMPUTE_UNITS = 80_000
const MAX_COMPUTE_UNITS = 1_400_000

type Fetch = typeof fetch

export interface JupiterQuote {
  inputMint: string
  inAmount: string
  outputMint: string
  outAmount: string
  /** The least the swap can return after slippage; the swap fails below it. */
  otherAmountThreshold: string
  swapMode: string
  slippageBps: number
  priceImpactPct: string
  routePlan: { swapInfo: { label?: string; ammKey: string }; percent: number }[]
  [key: string]: unknown
}

export interface RawInstruction {
  programId: string
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[]
  data: string
}

export interface JupiterSwapInstructions {
  computeBudgetInstructions?: RawInstruction[]
  setupInstructions?: RawInstruction[]
  tokenLedgerInstruction?: RawInstruction | null
  swapInstruction: RawInstruction
  cleanupInstruction?: RawInstruction | null
  otherInstructions?: RawInstruction[]
  addressLookupTableAddresses?: string[]
  computeUnitLimit?: number
  error?: string
}

async function readJson<T>(res: Response, what: string): Promise<T> {
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null
  if (!res.ok || !body || body.error) {
    throw new Error(body?.error ? `${what}: ${body.error}` : `${what} failed (${res.status})`)
  }
  return body
}

/** Quote spending exactly `lamports` of SOL on `outputMint`. */
export async function quoteSolToToken(
  a: { outputMint: string; lamports: bigint | number; slippageBps?: number },
  f: Fetch = fetch,
): Promise<JupiterQuote> {
  const params = new URLSearchParams({
    inputMint: WSOL_MINT,
    outputMint: a.outputMint,
    amount: BigInt(a.lamports).toString(),
    slippageBps: String(a.slippageBps ?? DEFAULT_SLIPPAGE_BPS),
    swapMode: 'ExactIn',
  })
  const quote = await readJson<JupiterQuote>(await f(`${JUPITER_API}/quote?${params}`), 'Jupiter quote')
  if (!quote.otherAmountThreshold || !quote.outAmount) throw new Error('Jupiter returned no route')
  return quote
}

export async function swapInstructions(
  a: { quote: JupiterQuote; user: string },
  f: Fetch = fetch,
): Promise<JupiterSwapInstructions> {
  const res = await f(`${JUPITER_API}/swap-instructions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: a.quote,
      userPublicKey: a.user,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
    }),
  })
  return readJson<JupiterSwapInstructions>(res, 'Jupiter swap')
}

export function toInstruction(raw: RawInstruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(raw.programId),
    keys: raw.accounts.map((k) => ({ pubkey: new PublicKey(k.pubkey), isSigner: k.isSigner, isWritable: k.isWritable })),
    data: Buffer.from(raw.data, 'base64'),
  })
}

const COMPUTE_BUDGET_ID = ComputeBudgetProgram.programId.toBase58()
const SET_COMPUTE_UNIT_LIMIT = 2

/** Units Jupiter asked for, read from its SetComputeUnitLimit instruction when present. */
export function jupiterComputeUnits(swap: JupiterSwapInstructions): number | null {
  if (swap.computeUnitLimit) return swap.computeUnitLimit
  for (const raw of swap.computeBudgetInstructions ?? []) {
    if (raw.programId !== COMPUTE_BUDGET_ID) continue
    const data = Buffer.from(raw.data, 'base64')
    if (data[0] === SET_COMPUTE_UNIT_LIMIT && data.length >= 5) return data.readUInt32LE(1)
  }
  return null
}

export function swapAndCallComputeUnits(swap: JupiterSwapInstructions, extra = CREATE_QUEST_COMPUTE_UNITS) {
  const swapUnits = jupiterComputeUnits(swap) ?? 400_000
  return Math.min(MAX_COMPUTE_UNITS, swapUnits + extra)
}

/**
 * One instruction list: compute budget (Jupiter's price, our limit), the swap
 * with its setup and cleanup, then `after` (create_quest). The swap creates the
 * user's token account if needed and fails unless at least
 * `otherAmountThreshold` arrives, so `after` can spend exactly that much.
 */
export function composeSwapThen(swap: JupiterSwapInstructions, after: TransactionInstruction[]) {
  const budget = (swap.computeBudgetInstructions ?? []).filter((raw) => {
    if (raw.programId !== COMPUTE_BUDGET_ID) return true
    return Buffer.from(raw.data, 'base64')[0] !== SET_COMPUTE_UNIT_LIMIT
  })
  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: swapAndCallComputeUnits(swap) }),
    ...budget.map(toInstruction),
    ...(swap.setupInstructions ?? []).map(toInstruction),
    ...(swap.tokenLedgerInstruction ? [toInstruction(swap.tokenLedgerInstruction)] : []),
    toInstruction(swap.swapInstruction),
    ...(swap.cleanupInstruction ? [toInstruction(swap.cleanupInstruction)] : []),
    ...(swap.otherInstructions ?? []).map(toInstruction),
    ...after,
  ]
  return { instructions, lookupTables: swap.addressLookupTableAddresses ?? [] }
}

/** Price impact as a percentage (Jupiter reports a fraction, 0.01 = 1%). */
export function priceImpactPercent(quote: Pick<JupiterQuote, 'priceImpactPct'>) {
  const n = Number(quote.priceImpactPct)
  return Number.isFinite(n) ? n * 100 : 0
}

export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')
/** Shown by explorers such as Solscan on every quest post. */
export const QUEST_MEMO = 'QUESTING'

/** An SPL Memo with no signers: costs a few hundred compute units and ~45 bytes. */
export function questMemoIx(text = QUEST_MEMO): TransactionInstruction {
  return new TransactionInstruction({ programId: MEMO_PROGRAM_ID, keys: [], data: Buffer.from(text, 'utf8') })
}
