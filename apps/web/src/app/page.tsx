'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Search, X } from 'lucide-react'
import { NavBar } from '@/components/nav-bar'
import { TAB_BAR_SPACE } from '@/components/tab-bar'
import { QuestRow } from '@/components/quest-row'
import { Notice, SectionHeader, groupedList } from '@/components/notice'
import { SkeletonRows } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { button } from '@/components/button'
import { useFeed, type FeedFilter } from '@/lib/queries'
import { useSession } from '@/lib/session'
import { errorMessage } from '@/lib/api'

const INTRO_KEY = 'quest:intro-dismissed'

export default function HomePage() {
  const { ready, authenticated, login } = useSession()
  const [introHidden, setIntroHidden] = useState(true)

  useEffect(() => {
    try {
      setIntroHidden(localStorage.getItem(INTRO_KEY) === '1')
    } catch {
      setIntroHidden(false)
    }
  }, [])

  function lookAround() {
    setIntroHidden(true)
    try {
      localStorage.setItem(INTRO_KEY, '1')
    } catch {
      // Private mode: the intro comes back next visit.
    }
  }

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
        {ready && !authenticated && !introHidden && <Intro onLookAround={lookAround} />}
        <Feed />
      </main>
    </div>
  )
}

function Intro({ onLookAround }: { onLookAround: () => void }) {
  return (
    <section aria-labelledby="intro-heading" className="pb-2">
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
          Post a challenge with a reward locked up. Whoever films it and gets approved is paid.
        </p>
        <Link href="/welcome" onClick={onLookAround} className={`${button()} mt-5 w-full`}>
          Get started
        </Link>
        <button type="button" onClick={onLookAround} className="press mt-1 h-11 w-full text-[17px] text-moss">
          Look around first
        </button>
      </div>
    </section>
  )
}

const FILTERS: { id: FeedFilter; label: string; signedIn?: boolean }[] = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'For you', signedIn: true },
  { id: 'ending', label: 'Ending soon' },
  { id: 'biggest', label: 'Biggest' },
]

const HEADINGS: Record<FeedFilter, string> = {
  all: 'Open now',
  mine: 'Posted for you',
  ending: 'Ending soonest',
  biggest: 'Biggest rewards',
}

function useDebounced(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

function Feed() {
  const { authenticated } = useSession()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FeedFilter>('all')
  const needle = useDebounced(query.trim(), 300)
  const { data, error, isPending, fetchNextPage, hasNextPage, isFetchingNextPage, refetch, isRefetching } = useFeed({
    q: needle,
    filter,
  })
  const quests = data?.pages.flat() ?? []
  const searching = needle.length > 0

  return (
    <section aria-labelledby="feed-heading">
      <div className="px-4 pt-3">
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
            placeholder="Search quests"
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

      <div role="radiogroup" aria-label="Show" className="chrome flex gap-2 overflow-x-auto px-4 pt-3 [scrollbar-width:none]">
        {FILTERS.filter((f) => !f.signedIn || authenticated).map((f) => (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`press h-8 shrink-0 rounded-full px-3.5 text-[15px] font-medium ${
              filter === f.id ? 'bg-moss text-paper-raised' : 'bg-ink/[0.06] text-ink'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <SectionHeader id="feed-heading">{searching ? `Results for “${needle}”` : HEADINGS[filter]}</SectionHeader>

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
        searching ? (
          <Notice>
            No open quests match “{needle}”.{' '}
            <button type="button" onClick={() => setQuery('')} className="font-semibold text-moss">
              Clear search
            </button>
          </Notice>
        ) : filter === 'mine' ? (
          <Notice>Nobody has posted a quest just for you yet. When they do, it shows up here.</Notice>
        ) : (
          <EmptyState
            art="/art/empty.jpg"
            title="The board is empty"
            body="Nothing is open right now. Post a challenge and yours will be the first one people see."
          >
            <Link href="/post" className={`${button()} w-full`}>
              Post a quest
            </Link>
          </EmptyState>
        )
      )}

      {quests.length > 0 && (
        <ul className={groupedList}>
          {quests.map((quest) => (
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
            {isFetchingNextPage ? 'Loading…' : 'Show more'}
          </button>
        </div>
      )}
    </section>
  )
}
