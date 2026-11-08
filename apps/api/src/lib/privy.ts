import { jwtVerify, importSPKI, type KeyLike } from 'jose'
import type { Env } from '../types'

let cachedKey: KeyLike | null = null

/** Verifies a Privy access token and returns the Privy user id (did:privy:...). */
export async function verifyPrivyToken(token: string, env: Env): Promise<string> {
  // Accept the PEM with real or escaped newlines; secret stores differ.
  cachedKey ??= await importSPKI(env.PRIVY_VERIFICATION_KEY.replace(/\\n/g, '\n'), 'ES256')
  const { payload } = await jwtVerify(token, cachedKey, {
    issuer: 'privy.io',
    audience: env.PRIVY_APP_ID,
  })
  if (!payload.sub) throw new Error('Token has no subject')
  return payload.sub
}

interface LinkedAccount {
  type: string
  chain_type?: string
  address?: string
  wallet_client_type?: string
}

/** The user's Solana wallet, preferring the Privy embedded one. */
export async function fetchSolanaWallet(privyUserId: string, env: Env): Promise<string | null> {
  const res = await fetch(`https://auth.privy.io/api/v1/users/${encodeURIComponent(privyUserId)}`, {
    headers: {
      Authorization: `Basic ${btoa(`${env.PRIVY_APP_ID}:${env.PRIVY_APP_SECRET}`)}`,
      'privy-app-id': env.PRIVY_APP_ID,
    },
  })
  if (!res.ok) throw new Error(`Privy user lookup failed with ${res.status}`)

  const user = await res.json<{ linked_accounts: LinkedAccount[] }>()
  const wallets = user.linked_accounts.filter((a) => a.type === 'wallet' && a.chain_type === 'solana' && a.address)
  const wallet = wallets.find((a) => a.wallet_client_type === 'privy') ?? wallets[0]
  return wallet?.address ?? null
}
