'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { NavBar } from '@/components/nav-bar'
import { TAB_BAR_SPACE } from '@/components/tab-bar'
import { QuestRow, questList } from '@/components/quest-row'
import { Notice, SectionHeader } from '@/components/notice'
import { SkeletonCards } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { button } from '@/components/button'
import { useFeed, useMe, type FeedFilter } from '@/lib/queries'
import { useSession } from '@/lib/session'
import { useOnline } from '@/lib/network'
import { timeAgo } from '@/lib/time'
import { errorMessage } from '@/lib/api'

const INTRO_KEY = 'quest:intro-dismissed'
const DRAFT_KEY = 'quest.post.draft'

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

  const signedOut = ready && !authenticated

  return (
    <div className={TAB_BAR_SPACE}>
      <NavBar
        title="Quests"
        large
        right={
          signedOut ? (
            <button type="button" onClick={login} className="press -mr-2 h-11 px-2 text-[17px] text-moss">
              Sign in
            </button>
          ) : null
        }
      />
      <main>
        {signedOut && !introHidden && <Intro onLookAround={lookAround} />}
        {signedOut && introHidden && <IntroCard />}
        <Feed />
      </main>
    </div>
  )
}

/** First visit: the full welcome. */
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

/** Signed out and browsing: a short reminder of what this is, above the board. */
function IntroCard() {
  return (
    <section aria-labelledby="intro-card-heading" className="mx-4 mt-1 overflow-hidden rounded-[16px] bg-paper-raised">
      <Image
        src="/art/complete.png"
        alt=""
        width={390}
        height={360}
        sizes="100vw"
        priority
        className="block h-[104px] w-full object-cover object-[50%_38%]"
      />
      <div className="px-4 pb-4 pt-3">
        <h2 id="intro-card-heading" className="font-display text-[20px] leading-tight">
          Dare someone. Pay when it’s done.
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <Link href="/welcome" className={`${button()} h-11 px-3 text-[16px]`}>
            Get started
          </Link>
          <Link href="/welcome?step=how&next=/" className={`${button('outline')} h-11 px-3 text-[16px]`}>
            How it works
          </Link>
        </div>
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
  const router = useRouter()
  const online = useOnline()
  const me = useMe()
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [filter, setFilter] = useState<FeedFilter>('all')
  const needle = useDebounced(query.trim(), 300)
  const { data, error, isPending, fetchNextPage, hasNextPage, isFetchingNextPage, refetch, isRefetching, dataUpdatedAt } =
    useFeed({ q: needle, filter })
  const forMe = useFeed({ filter: 'mine', enabled: authenticated })
  const forMeCount = authenticated ? (forMe.data?.pages.flat().length ?? 0) : 0
  const quests = data?.pages.flat() ?? []
  const searching = needle.length > 0

  function cancelSearch() {
    setQuery('')
    setFocused(false)
    ;(document.activeElement as HTMLElement | null)?.blur()
  }

  /** Carries the search over as the start of a new quest. */
  function postThisOne() {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}')
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, description: needle.slice(0, 280) }))
    } catch {
      // Private mode: they start from a blank quest.
    }
    router.push('/post')
  }

  const heading = searching
    ? isPending
      ? 'Searching…'
      : `${quests.length}${hasNextPage ? '+' : ''} ${quests.length === 1 && !hasNextPage ? 'result' : 'results'}`
    : HEADINGS[filter]

  return (
    <section aria-labelledby="feed-heading">
      <div className="flex items-center px-4 pt-3">
        <label htmlFor="feed-search" className="sr-only">
          Search quests
        </label>
        <div className="flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-[10px] bg-ink/[0.06] pl-2 pr-1">
          <Search className="h-[17px] w-[17px] shrink-0 text-ink-soft" strokeWidth={2.25} aria-hidden />
          <input
            id="feed-search"
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search quests"
            autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent text-[17px] placeholder:text-ink-soft/80 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="press flex h-9 w-9 items-center justify-center"
            >
              <X className="h-4 w-4 rounded-full bg-ink-soft/60 p-0.5 text-paper-raised" strokeWidth={3} aria-hidden />
            </button>
          )}
        </div>
        {(focused || query) && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={cancelSearch}
            className="press -mr-2 h-11 shrink-0 px-3 text-[17px] text-moss"
          >
            Cancel
          </button>
        )}
      </div>

      <div role="radiogroup" aria-label="Show" className="chrome flex gap-2 overflow-x-auto px-4 pt-3 [scrollbar-width:none]">
        {FILTERS.filter((f) => !f.signedIn || authenticated).map((f) => (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`press tabular h-8 shrink-0 rounded-full px-3.5 text-[15px] font-medium ${
              filter === f.id ? 'bg-ink text-paper-raised' : 'bg-ink/[0.06] text-ink'
            }`}
          >
            {f.label}
            {f.id === 'mine' && forMeCount > 0 && ` · ${forMeCount}`}
          </button>
        ))}
      </div>

      <SectionHeader id="feed-heading">
        {heading}
        {!online && dataUpdatedAt > 0 && ` · as of ${timeAgo(Math.floor(dataUpdatedAt / 1000))}`}
      </SectionHeader>

      {isPending && <SkeletonCards label="Loading quests" />}
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
          <div className="px-8 pb-6 pt-8 text-center">
            <h2 className="font-display text-[24px] leading-tight">No quests match</h2>
            <p className="mx-auto mt-2 max-w-[20rem] text-[15px] leading-relaxed text-ink-soft">
              Nobody has posted “{needle}” yet. You could be the one who does.
            </p>
            <button type="button" onClick={postThisOne} className={`${button()} mt-6 w-full`}>
              Post this one
            </button>
          </div>
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
        <ul className={questList}>
          {quests.map((quest) => (
            <QuestRow key={quest.id} quest={quest} viewer={me.data?.pubkey} match={searching ? needle : undefined} />
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
