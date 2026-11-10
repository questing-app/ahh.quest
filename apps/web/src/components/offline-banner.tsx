'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOnline, useServerDown } from '@/lib/network'

/**
 * Keeps what was loaded on screen and says why it might be stale: either the
 * phone is offline, or Quest itself isn't answering.
 */
export function OfflineBanner() {
  const online = useOnline()
  const serverDown = useServerDown()
  const queryClient = useQueryClient()
  const [trying, setTrying] = useState(false)

  useEffect(() => {
    if (online) queryClient.refetchQueries({ type: 'active' })
  }, [online, queryClient])

  if (online && !serverDown) return null

  // A request that gets through clears the server message on its own.
  async function retry() {
    setTrying(true)
    await queryClient.refetchQueries({ type: 'active' }).catch(() => {})
    setTrying(false)
  }

  return (
    <div
      role="status"
      className="chrome fixed inset-x-0 top-0 z-[45] bg-ink pt-[env(safe-area-inset-top)] text-[13px] text-paper-raised"
    >
      <div className="flex h-9 items-center justify-between gap-3 px-4">
        <span className="min-w-0 truncate">
          {online ? 'Quest isn’t answering right now.' : 'You’re offline. Showing what was already loaded.'}
        </span>
        <button
          type="button"
          onClick={retry}
          disabled={trying}
          className="press shrink-0 font-semibold text-moss-pale disabled:opacity-60"
        >
          {trying ? 'Trying…' : 'Try again'}
        </button>
      </div>
    </div>
  )
}
