'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

/** Keeps what was loaded on screen and says so while the phone is offline. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false)
  const queryClient = useQueryClient()

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  useEffect(() => {
    if (!offline) queryClient.refetchQueries({ type: 'active' })
  }, [offline, queryClient])

  if (!offline) return null
  return (
    <div
      role="status"
      className="chrome fixed inset-x-0 top-0 z-[45] bg-ink pt-[env(safe-area-inset-top)] text-[13px] text-paper-raised"
    >
      <div className="flex h-9 items-center justify-between gap-3 px-4">
        <span>You’re offline. Showing what was already loaded.</span>
        <button
          type="button"
          onClick={() => setOffline(!navigator.onLine)}
          className="press shrink-0 font-semibold text-moss-pale"
        >
          Retry
        </button>
      </div>
    </div>
  )
}
