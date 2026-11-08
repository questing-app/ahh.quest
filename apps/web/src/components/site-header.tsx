'use client'

import Link from 'next/link'
import { useSession } from '@/lib/session'
import { useMe } from '@/lib/queries'
import { Avatar } from './avatar'
import { button } from './button'

export function SiteHeader() {
  const { ready, authenticated, login } = useSession()
  const { data: me } = useMe()

  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex h-16 max-w-page items-center justify-between px-4 md:px-8">
        <Link href="/" className="font-display text-[28px] leading-none text-moss">
          Quest
        </Link>

        <nav className="flex items-center gap-4 text-[15px] sm:gap-6">
          <Link href="/" className="hidden text-ink-soft hover:text-ink sm:inline">
            Quests
          </Link>
          {ready && authenticated && (
            <>
              <Link href="/post" className={button('primary', 'sm')}>
                Post a quest
              </Link>
              <Link href="/me" aria-label="Your profile">
                <Avatar person={me} size={34} />
              </Link>
            </>
          )}
          {ready && !authenticated && (
            <button type="button" onClick={login} className={button('outline', 'sm')}>
              Sign in
            </button>
          )}
        </nav>
      </div>
    </header>
  )
}
