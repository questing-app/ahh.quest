'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Compass, Plus, UserRound } from 'lucide-react'

const TABS = [
  { href: '/', label: 'Quests', icon: Compass, match: (p: string) => p === '/' || p.startsWith('/q/') },
  { href: '/post', label: 'Post', icon: Plus, match: (p: string) => p.startsWith('/post') },
  { href: '/me', label: 'You', icon: UserRound, match: (p: string) => p.startsWith('/me') || p.startsWith('/u/') },
]

/** Screens that take over the whole display, like the camera. */
const HIDDEN = [/^\/welcome/, /^\/q\/[^/]+\/record/]

export function TabBar() {
  const pathname = usePathname() ?? '/'
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
                  <Icon className="h-[26px] w-[26px]" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                )}
                {label}
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
