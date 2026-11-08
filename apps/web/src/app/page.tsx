'use client'

import Image from 'next/image'
import Link from 'next/link'
import { SiteHeader } from '@/components/site-header'
import { QuestRow } from '@/components/quest-row'
import { Notice } from '@/components/notice'
import { button } from '@/components/button'
import { useFeed } from '@/lib/queries'
import { useSession } from '@/lib/session'
import { errorMessage } from '@/lib/api'

export default function HomePage() {
  const { ready, authenticated } = useSession()

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-page px-4 md:px-8">
        {ready && !authenticated && <Intro />}
        <Feed />
      </main>
    </>
  )
}

function Intro() {
  const { login } = useSession()

  return (
    <section className="grid items-center gap-8 border-b border-rule py-10 md:grid-cols-12 md:gap-12 md:py-14">
      <Image
        src="/art/complete.png"
        alt="A knight hands a glowing coin to a wizard beside an open chest of gold"
        width={390}
        height={360}
        priority
        className="art-fade w-full max-w-[420px] md:col-span-4"
      />
      <div className="md:col-span-8">
        <h1 className="font-display text-[38px] leading-[1.05] text-moss md:text-[44px] lg:text-[52px]">
          Dare someone.
          <br />
          Pay when they prove it.
        </h1>
        <p className="mt-5 max-w-[34rem] text-[17px] leading-relaxed text-ink-soft">
          Post a challenge and put up the reward. Whoever films themselves doing it gets paid once
          the video is approved. If the video doesn’t pass, the reward goes back to you.
        </p>
        <button type="button" onClick={login} className={`${button()} mt-7`}>
          Sign in to post a quest
        </button>
      </div>
    </section>
  )
}

function Feed() {
  const { data, error, isPending, fetchNextPage, hasNextPage, isFetchingNextPage } = useFeed()
  const quests = data?.pages.flat() ?? []

  return (
    <section className="py-10" aria-labelledby="feed-heading">
      <h2 id="feed-heading" className="font-display text-[30px] leading-none">
        Open quests
      </h2>

      {isPending && <Notice>Loading quests…</Notice>}
      {error && <Notice tone="error">{errorMessage(error)}</Notice>}
      {!isPending && !error && quests.length === 0 && (
        <Notice>
          Nothing open right now.{' '}
          <Link href="/post" className="font-semibold text-moss underline underline-offset-4">
            Post the first one
          </Link>
          .
        </Notice>
      )}

      {quests.length > 0 && (
        <ul className="mt-4 divide-y divide-rule border-t border-rule">
          {quests.map((quest) => (
            <QuestRow key={quest.id} quest={quest} />
          ))}
        </ul>
      )}

      {hasNextPage && (
        <button
          type="button"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className={`${button('outline', 'sm')} mt-6`}
        >
          {isFetchingNextPage ? 'Loading…' : 'Show more'}
        </button>
      )}
    </section>
  )
}
