'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DEFAULT_SLIPPAGE_BPS, priceImpactPercent, quoteSolToToken } from '@quest/sdk'
import { CLUSTER } from './chain'
import { TOKENS } from './tokens'

// Paying for a quest in SOL: Jupiter buys QUEST in the same transaction that
// funds the quest. Only mainnet has a market for QUEST.
export const SOL_PAY_ENABLED = CLUSTER === 'mainnet-beta'
export const SLIPPAGE_BPS = DEFAULT_SLIPPAGE_BPS
export const LAMPORTS_PER_SOL = 1_000_000_000
/**
 * Kept back for rent and fees: the quest and escrow accounts, the QUEST token
 * account if it's new, a temporary wrapped-SOL account (refunded) and the fee.
 */
export const SOL_RESERVE_LAMPORTS = 15_000_000

export function formatSol(lamports: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(lamports / LAMPORTS_PER_SOL)
}

/** "0.25" -> 250000000. Null for anything unparseable or more precise than a lamport. */
export function toLamports(input: string): number | null {
  const clean = input.trim()
  if (!/^\d+(\.\d{1,9})?$/.test(clean)) return null
  const [whole, frac = ''] = clean.split('.')
  const lamports = Number(whole) * LAMPORTS_PER_SOL + Number(frac.padEnd(9, '0'))
  return Number.isSafeInteger(lamports) && lamports > 0 ? lamports : null
}

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

/** A live SOL -> QUEST quote, refreshed while it's on screen. */
export function useSolQuote(lamports: number | null, enabled: boolean) {
  const amount = useDebounced(lamports, 400)
  const query = useQuery({
    queryKey: ['jupiter-quote', TOKENS[0].mint, amount, SLIPPAGE_BPS],
    enabled: enabled && SOL_PAY_ENABLED && !!amount,
    queryFn: () => quoteSolToToken({ outputMint: TOKENS[0].mint, lamports: amount!, slippageBps: SLIPPAGE_BPS }),
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: 1,
  })
  const quote = amount === lamports ? query.data : undefined
  return {
    ...query,
    settling: amount !== lamports || (query.isFetching && !query.data),
    quote,
    estimated: quote ? Number(quote.outAmount) : null,
    minimum: quote ? Number(quote.otherAmountThreshold) : null,
    impact: quote ? priceImpactPercent(quote) : null,
  }
}
