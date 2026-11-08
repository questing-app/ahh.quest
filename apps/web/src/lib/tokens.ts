export interface Token {
  symbol: string
  mint: string
  decimals: number
}

// Mainnet $QUEST is E7Xf…pump, a Token-2022 mint. On devnet we use a Token-2022
// test mint the dev faucet hands out, so both networks take the same code path.
export const QUEST_MINT = process.env.NEXT_PUBLIC_QUEST_MINT ?? 'DV1RyE7yrujJd1pzN9ccekCTpDfYiUuxdguqRkxCu63m'

export const TOKENS: Token[] = [{ symbol: 'QUEST', mint: QUEST_MINT, decimals: 6 }]

export function tokenForMint(mint: string): Token {
  return TOKENS.find((t) => t.mint === mint) ?? { symbol: shortAddress(mint), mint, decimals: 6 }
}

// Basis points must match the on-chain config and claim.service.ts.
export const FEE_BPS = 250
export const STAKE_BPS = 500
export const MIN_REWARD_UNITS = 1_000_000

export const feeFor = (units: number) => Math.floor((units * FEE_BPS) / 10_000)
export const stakeFor = (units: number) => Math.ceil((units * STAKE_BPS) / 10_000)

/** "12.5" -> 12500000 for a 6-decimal token. Returns null for anything unparseable. */
export function toUnits(input: string, decimals: number): number | null {
  const clean = input.trim()
  if (!/^\d+(\.\d+)?$/.test(clean)) return null
  const [whole, frac = ''] = clean.split('.')
  if (frac.length > decimals) return null
  const units = Number(whole) * 10 ** decimals + Number(frac.padEnd(decimals, '0'))
  return Number.isSafeInteger(units) ? units : null
}

export function formatUnits(units: number, decimals: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: Math.min(decimals, 4) }).format(
    units / 10 ** decimals,
  )
}

export function formatAmount(units: number, mint: string): string {
  const token = tokenForMint(mint)
  return `${formatUnits(units, token.decimals)} ${token.symbol}`
}

export function shortAddress(address: string): string {
  return address.length > 10 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address
}
