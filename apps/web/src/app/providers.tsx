'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PrivyProvider } from '@privy-io/react-auth'
import { toSolanaWalletConnectors, useSolanaWallets } from '@privy-io/react-auth/solana'
import { AccessTokenProvider, useSession } from '@/lib/session'
import { useMe } from '@/lib/queries'
import { hasDefaultName } from '@/lib/types'
import { CLUSTER, RPC_URL } from '@/lib/chain'

// No auto-connect: some injected wallets (MetaMask's Solana support) pop a
// connect prompt on every page load instead of reconnecting quietly. External
// wallets are connected on demand when something needs a signature.
const solanaConnectors = toSolanaWalletConnectors({ shouldAutoConnect: false })

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } }),
  )

  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? ''}
      config={{
        loginMethods: ['email', 'google', 'twitter', 'wallet'],
        appearance: {
          theme: '#FCF9F1',
          accentColor: '#4B6629',
          walletChainType: 'solana-only',
          landingHeader: 'Sign in to Quest',
          loginMessage: 'We’ll make you a wallet, or you can use the one you already have.',
          logo: '/apple-icon',
        },
        externalWallets: { solana: { connectors: solanaConnectors } },
        solanaClusters: [{ name: CLUSTER, rpcUrl: RPC_URL }],
      }}
    >
      <AccessTokenProvider>
        <QueryClientProvider client={queryClient}>
          <EnsureSolanaWallet />
          <FirstRunRedirect />
          {children}
        </QueryClientProvider>
      </AccessTokenProvider>
    </PrivyProvider>
  )
}

/** Email and social logins arrive without a wallet; give them an embedded Solana one. */
function EnsureSolanaWallet() {
  const { authenticated } = useSession()
  const { ready, wallets, createWallet } = useSolanaWallets()
  const attempted = useRef(false)

  useEffect(() => {
    if (!authenticated || !ready || wallets.length > 0 || attempted.current) return
    attempted.current = true
    createWallet().catch((err) => console.error('Could not create Solana wallet', err))
  }, [authenticated, ready, wallets.length, createWallet])

  return null
}

/** Send brand-new accounts through /welcome once so they pick a name. */
function FirstRunRedirect() {
  const { data: me } = useMe()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!me || !hasDefaultName(me) || pathname === '/welcome') return
    try {
      if (sessionStorage.getItem('quest:welcomed')) return
      sessionStorage.setItem('quest:welcomed', '1')
    } catch {
      // Storage blocked: still show onboarding, just possibly more than once.
    }
    // Signed up from Post or Take: just the name, then back to what they were doing.
    router.push(`/welcome?step=name&next=${encodeURIComponent(pathname ?? '/')}`)
  }, [me, pathname, router])

  return null
}
