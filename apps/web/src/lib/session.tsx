'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { apiFetch, type RequestOptions } from './api'

// Privy access tokens last an hour; refresh well before that.
const REFRESH_MS = 10 * 60 * 1000

const TokenContext = createContext<string | null>(null)

export function AccessTokenProvider({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, getAccessToken } = usePrivy()
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    if (!ready || !authenticated) {
      setToken(null)
      return
    }
    let live = true
    const refresh = () => getAccessToken().then((t) => live && setToken(t)).catch(() => live && setToken(null))
    refresh()
    const timer = setInterval(refresh, REFRESH_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [ready, authenticated, getAccessToken])

  return <TokenContext.Provider value={token}>{children}</TokenContext.Provider>
}

export function useSession() {
  const { ready, authenticated, login, logout } = usePrivy()
  const token = useContext(TokenContext)
  return { ready, authenticated, token: authenticated ? token : null, login, logout }
}

export function useApi() {
  const { token } = useSession()
  return useCallback(
    <T,>(path: string, opts: Omit<RequestOptions, 'token'> = {}) => apiFetch<T>(path, { ...opts, token }),
    [token],
  )
}
