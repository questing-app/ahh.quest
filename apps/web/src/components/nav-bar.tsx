'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

type Props = {
  title: string
  /** Root tab screens show an iOS large title that collapses into the bar on scroll. */
  large?: boolean
  /** Pushed screens show a back chevron. A string sets the label next to it. */
  back?: boolean | string
  /** Where back goes when there is no history (e.g. opened from a shared link). */
  backHref?: string
  right?: React.ReactNode
  /** Replaces the back button, e.g. “Cancel” on the first step of a form. */
  left?: React.ReactNode
  /** Overrides what back does, e.g. stepping back inside a form. */
  onBack?: () => void
}

export function NavBar({ title, large = false, back = false, backHref = '/', right, left, onBack }: Props) {
  const router = useRouter()
  const sentinel = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting), {
      rootMargin: '-52px 0px 0px 0px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  function goBack() {
    if (onBack) return onBack()
    if (window.history.length > 1) router.back()
    else router.push(backHref)
  }

  const showSmallTitle = !large || scrolled

  return (
    <>
      <header
        className={`chrome sticky top-0 z-30 pt-[env(safe-area-inset-top)] transition-colors duration-200 ${
          scrolled ? 'bg-paper/80 shadow-[0_0.5px_0_rgba(38,38,31,0.18)] backdrop-blur-xl backdrop-saturate-150' : 'bg-paper'
        }`}
      >
        <div className="relative flex h-11 items-center justify-between px-2">
          <div className="flex min-w-[72px] items-center">
            {left}
            {!left && back && (
              <button
                type="button"
                onClick={goBack}
                className="press flex h-11 items-center pr-2 text-[17px] text-moss"
              >
                <ChevronLeft className="h-7 w-7" strokeWidth={2.25} aria-hidden />
                <span className="-ml-0.5 max-w-[96px] truncate">{typeof back === 'string' ? back : 'Back'}</span>
              </button>
            )}
          </div>
          <h1
            className={`pointer-events-none absolute inset-x-[96px] truncate text-center text-[17px] font-semibold transition-opacity duration-200 ${
              showSmallTitle ? 'opacity-100' : 'opacity-0'
            }`}
            aria-hidden={large}
          >
            {title}
          </h1>
          <div className="flex min-w-[72px] items-center justify-end gap-1 pr-2">{right}</div>
        </div>
      </header>
      {large && (
        <h2 className="px-4 pb-2 pt-1 font-display text-[34px] leading-[1.1] text-moss">{title}</h2>
      )}
      <div ref={sentinel} aria-hidden className="h-px" />
    </>
  )
}
