'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Compass, Inbox, Plus, UserRound } from 'lucide-react'
import { useMemo } from 'react'
import { useMyFeed } from '@/lib/queries'
import { buildActivity } from '@/lib/activity'

const TABS = [
  { href: '/', label: 'Quests', icon: Compass, match: (p: string) => p === '/' || p.startsWith('/q/') },
  { href: '/activity', label: 'Activity', icon: Inbox, match: (p: string) => p.startsWith('/activity') },
  { href: '/post', label: 'Post', icon: Plus, match: (p: string) => p.startsWith('/post') },
  { href: '/me', label: 'You', icon: UserRound, match: (p: string) => p.startsWith('/me') || p.startsWith('/u/') },
]

/** Screens that take over the whole display, like the camera. */
const HIDDEN = [/^\/welcome/, /^\/q\/[^/]+\/record/]

export function TabBar() {
  const pathname = usePathname() ?? '/'
  const mine = useMyFeed()
  const needsYou = useMemo(() => (mine.data ? buildActivity(mine.data).needsYou.length : 0), [mine.data])
  if (HIDDEN.some((re) => re.test(pathname))) return null

  return (
    <nav
      aria-label="Main"
      className="chrome fixed inset-x-0 bottom-0 z-40 border-t-[0.5px] border-ink/15 bg-paper-raised/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150"
    >
      <ul className="mx-auto flex h-[49px] max-w-[520px]">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname)
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`press flex h-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
                  active ? 'text-moss' : 'text-ink-soft/80'
                }`}
              >
                {href === '/post' ? (
                  <span
                    className={`flex h-[26px] w-[26px] items-center justify-center rounded-full ${
                      active ? 'bg-moss text-paper-raised' : 'bg-ink-soft/80 text-paper-raised'
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px]" strokeWidth={2.75} aria-hidden />
                  </span>
                ) : (
                  <span className="relative">
                    <Icon className="h-[26px] w-[26px]" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                    {href === '/activity' && needsYou > 0 && (
                      <span className="tabular absolute -right-2 -top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-wax px-1 text-[11px] font-semibold leading-none text-paper-raised">
                        {needsYou}
                      </span>
                    )}
                  </span>
                )}
                {label}
                {href === '/activity' && needsYou > 0 && <span className="sr-only">, {needsYou} need you</span>}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** Bottom padding so content clears the tab bar and the home indicator. */
export const TAB_BAR_SPACE = 'pb-[calc(49px+env(safe-area-inset-bottom)+24px)]'
