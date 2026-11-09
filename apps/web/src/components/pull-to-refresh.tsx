'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { RotateCw } from 'lucide-react'

const TRIGGER = 72
/** Full-screen flows where pulling down shouldn't reload anything. */
const OFF = [/^\/welcome/, /^\/q\/[^/]+\/record/]

/**
 * The page never scrolls past its edges, so pulling down at the top of any
 * screen refreshes what's on it, the way iOS lists do.
 */
export function PullToRefresh() {
  const pathname = usePathname() ?? '/'
  const queryClient = useQueryClient()
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const start = useRef<number | null>(null)
  const pullRef = useRef(0)
  const off = OFF.some((re) => re.test(pathname))

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.app-root')
    if (!root || off) return

    const onStart = (e: TouchEvent) => {
      const inSheet = (e.target as Element | null)?.closest('[role="dialog"]')
      start.current = root.scrollTop <= 0 && !inSheet && !refreshing ? e.touches[0].clientY : null
    }
    const onMove = (e: TouchEvent) => {
      if (start.current === null) return
      const dy = e.touches[0].clientY - start.current
      if (root.scrollTop > 0 || dy <= 0) {
        pullRef.current = 0
        setPull(0)
        return
      }
      // Resist more the further it goes, like a rubber band.
      pullRef.current = Math.min(120, dy * 0.5)
      setPull(pullRef.current)
    }
    const onEnd = async () => {
      if (start.current === null) return
      start.current = null
      const reached = pullRef.current >= TRIGGER * 0.75
      pullRef.current = 0
      setPull(0)
      if (!reached) return
      setRefreshing(true)
      navigator.vibrate?.(8)
      await Promise.all([queryClient.refetchQueries({ type: 'active' }), new Promise((r) => setTimeout(r, 500))])
      setRefreshing(false)
    }

    root.addEventListener('touchstart', onStart, { passive: true })
    root.addEventListener('touchmove', onMove, { passive: true })
    root.addEventListener('touchend', onEnd)
    root.addEventListener('touchcancel', onEnd)
    return () => {
      root.removeEventListener('touchstart', onStart)
      root.removeEventListener('touchmove', onMove)
      root.removeEventListener('touchend', onEnd)
      root.removeEventListener('touchcancel', onEnd)
    }
  }, [off, queryClient, refreshing])

  if (off || (!refreshing && pull === 0)) return null

  const progress = refreshing ? 1 : Math.min(1, pull / (TRIGGER * 0.75))
  const offset = refreshing ? 56 : pull

  return (
    <div
      aria-hidden={!refreshing}
      role={refreshing ? 'status' : undefined}
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+44px)] z-20 flex justify-center"
      style={{ transform: `translateY(${offset - 44}px)`, transition: refreshing || pull === 0 ? 'transform 200ms ease' : 'none' }}
    >
      <span
        className="flex h-9 w-9 items-center justify-center rounded-full bg-paper-raised text-moss shadow-[0_2px_10px_rgba(38,38,31,0.18)]"
        style={{ opacity: progress }}
      >
        <RotateCw
          className={`h-[18px] w-[18px] ${refreshing ? 'animate-spin' : ''}`}
          strokeWidth={2.5}
          style={refreshing ? undefined : { transform: `rotate(${progress * 270}deg)` }}
        />
        {refreshing && <span className="sr-only">Refreshing</span>}
      </span>
    </div>
  )
}
