'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PublicKey } from '@solana/web3.js'
import { ata } from '@quest/sdk'
import { CLUSTER, connection, useWallet } from '@/lib/chain'
import { useApi } from '@/lib/session'
import { errorMessage } from '@/lib/api'
import { TOKENS, formatUnits } from '@/lib/tokens'
import { toast } from './toast'

const token = TOKENS[0]
const MIN_FEE_LAMPORTS = 5_000_000

/** QUEST held by the signed-in wallet, in base units. */
export function useTokenBalance() {
  const { address } = useWallet()
  return useQuery({
    queryKey: ['balance', address],
    enabled: !!address,
    queryFn: async () => {
      const account = ata(token.mint, address!)
      const info = await connection.getTokenAccountBalance(account).catch(() => null)
      return info ? Number(info.value.amount) : 0
    },
  })
}

/** SOL held by the signed-in wallet, in lamports. It pays network fees. */
export function useSolBalance() {
  const { address } = useWallet()
  return useQuery({
    queryKey: ['balance', 'sol', address],
    enabled: !!address,
    queryFn: () => connection.getBalance(new PublicKey(address!)),
  })
}

export function TokenBalance() {
  const api = useApi()
  const queryClient = useQueryClient()
  const tokens = useTokenBalance()
  const sol = useSolBalance()

  const faucet = useMutation({
    mutationFn: () => api('/api/dev/faucet', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['balance'] })
      toast('Test QUEST sent to your wallet')
    },
  })

  if (tokens.data === undefined) return null
  const short = tokens.data === 0 || (sol.data ?? 0) < MIN_FEE_LAMPORTS

  return (
    <div className="text-[15px]">
      <p className="tabular text-ink-soft">
        You have <span className="font-semibold text-ink">{formatUnits(tokens.data, token.decimals)} {token.symbol}</span>
        {short && sol.data !== undefined && sol.data < MIN_FEE_LAMPORTS && ' and not enough SOL for network fees'}.
      </p>
      {CLUSTER === 'devnet' && short && (
        <>
          <button
            type="button"
            onClick={() => faucet.mutate()}
            disabled={faucet.isPending}
            className="press -my-1 min-h-[44px] text-moss disabled:text-ink-soft"
          >
            {faucet.isPending ? 'Sending test tokens…' : 'Get 1,000 test QUEST and fee money'}
          </button>
          {faucet.error && (
            <p role="alert" className="mt-1 text-wax">
              {errorMessage(faucet.error)}
            </p>
          )}
        </>
      )}
    </div>
  )
}
