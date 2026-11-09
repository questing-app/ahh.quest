'use client'

import Image from 'next/image'
import Link from 'next/link'
import { NavBar } from '@/components/nav-bar'
import { TAB_BAR_SPACE } from '@/components/tab-bar'
import { QuestRow } from '@/components/quest-row'
import { Notice, SectionHeader, groupedList } from '@/components/notice'
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
            <button type="button" onClick={login} className="press text-[17px] text-moss">
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
    <section className="px-4">
      <Image
        src="/art/complete.png"
        alt="A knight hands a glowing coin to a wizard beside an open chest of gold"
        width={390}
        height={360}
        priority
        className="art-fade mx-auto -mb-4 w-full max-w-[280px]"
      />
      <div className="text-center">
        <h2 className="font-display text-[28px] leading-[1.1] text-moss">
          Dare someone.
          <br />
          Pay when it’s done.
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          Post a challenge and put up the reward. Whoever films themselves doing it gets paid once the video is
          approved. If it doesn’t pass, the reward comes back to you.
        </p>
        <button type="button" onClick={login} className={`${button()} mt-5 w-full`}>
          Get started
        </button>
      </div>
    </section>
  )
}

function Feed() {
  const { data, error, isPending, fetchNextPage, hasNextPage, isFetchingNextPage } = useFeed()
  const quests = data?.pages.flat() ?? []

  return (
    <section aria-labelledby="feed-heading">
      <SectionHeader id="feed-heading">Open now</SectionHeader>

      {isPending && <Notice>Loading quests…</Notice>}
      {error && <Notice tone="error">{errorMessage(error)}</Notice>}
      {!isPending && !error && quests.length === 0 && (
        <Notice>
          Nothing open right now.{' '}
          <Link href="/post" className="font-semibold text-moss">
            Post the first one
          </Link>
        </Notice>
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
