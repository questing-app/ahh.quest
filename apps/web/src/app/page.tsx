'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Search, X } from 'lucide-react'
import { NavBar } from '@/components/nav-bar'
import { TAB_BAR_SPACE } from '@/components/tab-bar'
import { QuestRow } from '@/components/quest-row'
import { Notice, SectionHeader, groupedList } from '@/components/notice'
import { SkeletonRows } from '@/components/skeleton'
import { button } from '@/components/button'
import { useFeed } from '@/lib/queries'
import { useSession } from '@/lib/session'
import { errorMessage } from '@/lib/api'

export default function HomePage() {
  const { ready, authenticated, login } = useSession()

  return (
    <div className={TAB_BAR_SPACE}>
      <NavBar
        title="Quests"
        large
        right={
          ready && !authenticated ? (
            <button type="button" onClick={login} className="press -mr-2 h-11 px-2 text-[17px] text-moss">
              Sign in
            </button>
          ) : null
        }
      />
      <main>
        {ready && !authenticated && <Intro />}
        <Feed />
      </main>
    </div>
  )
}

function Intro() {
  const { login } = useSession()

  return (
    <section aria-labelledby="intro-heading">
      <div className="relative">
        <Image
          src="/art/complete.png"
          alt="A knight hands a glowing coin to a wizard beside an open chest of gold"
          width={390}
          height={360}
          sizes="100vw"
          priority
          className="block h-auto w-full"
        />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-b from-paper/0 to-paper" />
      </div>
      <div className="relative -mt-6 px-4 text-center">
        <h2 id="intro-heading" className="font-display text-[28px] leading-[1.1] text-moss">
          Dare someone.
          <br />
          Pay when it’s done.
        </h2>
        <p className="mx-auto mt-3 max-w-[20rem] text-[15px] leading-relaxed text-ink-soft">
          Post a challenge and lock up a reward. Whoever films it and gets approved is paid. If nobody does, you
          get it back.
        </p>
        <button type="button" onClick={login} className={`${button()} mt-5 w-full`}>
          Get started
        </button>
      </div>
    </section>
  )
}

function Feed() {
  const { data, error, isPending, fetchNextPage, hasNextPage, isFetchingNextPage, refetch, isRefetching } = useFeed()
  const [query, setQuery] = useState('')
  const quests = data?.pages.flat() ?? []
  const needle = query.trim().toLowerCase()
  const shown = needle ? quests.filter((q) => q.description.toLowerCase().includes(needle)) : quests

  return (
    <section aria-labelledby="feed-heading">
      {quests.length > 0 && (
        <div className="px-4 pt-4">
          <label htmlFor="feed-search" className="sr-only">
            Search quests
          </label>
          <div className="flex h-9 items-center gap-1.5 rounded-[10px] bg-ink/[0.06] pl-2 pr-1">
            <Search className="h-[17px] w-[17px] shrink-0 text-ink-soft" strokeWidth={2.25} aria-hidden />
            <input
              id="feed-search"
              type="search"
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              autoComplete="off"
              className="h-full min-w-0 flex-1 bg-transparent text-[17px] placeholder:text-ink-soft/80 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="press flex h-9 w-9 items-center justify-center"
              >
                <X className="h-4 w-4 rounded-full bg-ink-soft/60 p-0.5 text-paper-raised" strokeWidth={3} aria-hidden />
              </button>
            )}
          </div>
        </div>
      )}

      <SectionHeader id="feed-heading">{needle ? 'Results' : 'Open now'}</SectionHeader>

      {isPending && <SkeletonRows label="Loading quests" />}
      {error && (
        <div className="px-4 text-center">
          <Notice tone="error">{errorMessage(error)}</Notice>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isRefetching}
            className={`${button('outline')} -mt-6 w-full`}
          >
            {isRefetching ? 'Trying again…' : 'Try again'}
          </button>
        </div>
      )}
      {!isPending && !error && quests.length === 0 && (
        <Notice>
          Nothing open right now.{' '}
          <Link href="/post" className="font-semibold text-moss">
            Post the first one
          </Link>
        </Notice>
      )}
      {needle && shown.length === 0 && quests.length > 0 && (
        <Notice>
          No quests match “{query.trim()}”.{' '}
          <button type="button" onClick={() => setQuery('')} className="font-semibold text-moss">
            Clear search
          </button>
        </Notice>
      )}

      {shown.length > 0 && (
        <ul className={groupedList}>
          {shown.map((quest) => (
            <QuestRow key={quest.id} quest={quest} />
          ))}
        </ul>
      )}

      {hasNextPage && (
        <div className="px-4">
          <button
            type="button"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className={`${button('outline')} mt-4 w-full`}
          >
            {isFetchingNextPage ? 'Loading…' : needle ? 'Search more quests' : 'Show more'}
          </button>
        </div>
      )}
    </section>
  )
}
