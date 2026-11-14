'use client'

import { useCallback } from 'react'
import { Connection, PublicKey, Transaction, type TransactionInstruction } from '@solana/web3.js'
import { usePrivy } from '@privy-io/react-auth'
import { useSolanaWallets } from '@privy-io/react-auth/solana'
import { PROGRAM_ERRORS, questProgram } from '@quest/sdk'
import { useMe } from './queries'

export const CLUSTER = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? 'devnet') as 'devnet' | 'mainnet-beta'
// The API's /rpc proxy keeps a paid RPC key off the browser. An explicit
// NEXT_PUBLIC_SOLANA_RPC_URL still wins; with neither set, use public devnet.
const API_URL = process.env.NEXT_PUBLIC_API_URL
export const RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? (API_URL ? `${API_URL.replace(/\/$/, '')}/rpc` : 'https://api.devnet.solana.com')

export const connection = new Connection(RPC_URL, 'confirmed')
export const program = questProgram(connection)

const explorerSuffix = CLUSTER === 'mainnet-beta' ? '' : `?cluster=${CLUSTER}`
export const explorerTx = (signature: string) => `https://explorer.solana.com/tx/${signature}${explorerSuffix}`
export const explorerAddress = (address: string) => `https://explorer.solana.com/address/${address}${explorerSuffix}`

/** The wallet the API knows this user by, ready to sign. */
export function useWallet() {
  const { data: me } = useMe()
  const { wallets } = useSolanaWallets()
  const wallet = wallets.find((w) => w.address === me?.pubkey) ?? null
  return { wallet, address: me?.pubkey ?? null }
}

/** Sign and send instructions with the user's wallet, then wait for confirmation. */
export function useSendTransaction() {
  const { wallet, address } = useWallet()
  const { connectWallet } = usePrivy()

  return useCallback(
    async (instructions: TransactionInstruction[]) => {
      if (!wallet) {
        // An external wallet (Phantom etc.) isn't reconnected automatically; ask for it now.
        if (address) {
          connectWallet({ suggestedAddress: address })
          throw new Error('Connect your wallet, then tap again.')
        }
        throw new Error('Your wallet is still loading. Try again in a moment.')
      }
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
      const tx = new Transaction({ feePayer: new PublicKey(wallet.address), blockhash, lastValidBlockHeight })
      tx.add(...instructions)
      try {
        // Sign only, then send ourselves: external wallets like Phantom would
        // otherwise broadcast to whichever network they're set to.
        const signed = await wallet.signTransaction(tx)
        const signature = await connection.sendRawTransaction(signed.serialize())
        await confirmByPolling(signature, lastValidBlockHeight)
        return signature
      } catch (err) {
        throw new Error(transactionErrorMessage(err))
      }
    },
    [wallet, address, connectWallet],
  )
}

/**
 * Wait for 'confirmed' by polling, not a websocket subscription: the /rpc
 * proxy is plain HTTP. Gives up once the blockhash can no longer land.
 */
async function confirmByPolling(signature: string, lastValidBlockHeight: number) {
  for (;;) {
    const { value } = await connection.getSignatureStatuses([signature])
    const status = value[0]
    if (status?.err) throw new Error(JSON.stringify(status.err))
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') return
    if ((await connection.getBlockHeight('confirmed')) > lastValidBlockHeight) {
      throw new Error('Transaction expired: blockhash no longer valid')
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
}

const programErrors = new Map(PROGRAM_ERRORS.map((e) => [e.code, e.msg]))

export function transactionErrorMessage(err: unknown): string {
  const text = err instanceof Error ? `${err.message} ${(err as { logs?: string[] }).logs?.join(' ') ?? ''}` : String(err)

  const custom = text.match(/custom program error: (0x[0-9a-f]+)/i) ?? text.match(/"Custom":(\d+)/)
  if (custom) {
    const code = Number(custom[1])
    if (programErrors.has(code)) return `${programErrors.get(code)}.`
    if (code === 1) return 'Not enough tokens in your wallet for this.'
  }
  if (/no record of a prior credit|insufficient (funds|lamports)/i.test(text)) {
    return 'Your wallet needs a little SOL to pay network fees.'
  }
  if (/reject|denied|cancel/i.test(text)) return 'You cancelled the transaction.'
  if (/blockhash|expired/i.test(text)) return 'The network was slow and the transaction expired. Try again.'
  return 'The transaction didn’t go through. Try again.'
}
