'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
import { NavBar } from '@/components/nav-bar'
import { TAB_BAR_SPACE } from '@/components/tab-bar'
import { Notice, SectionHeader, groupedList } from '@/components/notice'
import { SkeletonRows } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { button } from '@/components/button'
import { useMyFeed } from '@/lib/queries'
import { useSession } from '@/lib/session'
import { buildActivity, type ActivityItem } from '@/lib/activity'
import { formatAmount } from '@/lib/tokens'
import { errorMessage } from '@/lib/api'

export default function ActivityPage() {
  const { ready, authenticated, login } = useSession()
  const mine = useMyFeed()
  const activity = useMemo(() => (mine.data ? buildActivity(mine.data) : null), [mine.data])

  if (ready && !authenticated) {
    return (
      <div className={TAB_BAR_SPACE}>
        <NavBar title="Activity" large />
        <EmptyState
          art="/art/empty.jpg"
          title="Your quests live here"
          body="Sign in and every quest you post or take shows up here, with anything that needs you at the top."
        >
          <button type="button" onClick={login} className={`${button()} w-full`}>
            Sign in
          </button>
        </EmptyState>
      </div>
    )
  }

  const empty = activity && !activity.needsYou.length && !activity.inProgress.length && !activity.done.length

  return (
    <div className={TAB_BAR_SPACE}>
      <NavBar title="Activity" large />
      <main>
        {(!ready || mine.isPending) && <SkeletonRows count={4} label="Loading your activity" />}
        {mine.error && (
          <div className="px-4 text-center">
            <Notice tone="error">{errorMessage(mine.error)}</Notice>
            <button type="button" onClick={() => mine.refetch()} className={`${button('outline')} -mt-6 w-full`}>
              Try again
            </button>
          </div>
        )}

        {empty && (
          <EmptyState
            art="/art/empty.jpg"
            title="Nothing yet"
            body="Quests you post or take show up here, with anything that needs you at the top."
          >
            <Link href="/" className={`${button()} w-full`}>
              Find a quest
            </Link>
            <Link href="/post" className={`${button('outline')} w-full`}>
              Post one
            </Link>
          </EmptyState>
        )}

        {activity && !empty && (
          <>
            <Group id="needs-you" title="Needs you" items={activity.needsYou} empty="You’re all caught up." />
            <Group id="in-progress" title="In progress" items={activity.inProgress} />
            <Group id="done" title="Done" items={activity.done} />
          </>
        )}
      </main>
    </div>
  )
}

function Group({ id, title, items, empty }: { id: string; title: string; items: ActivityItem[]; empty?: string }) {
  if (items.length === 0 && !empty) return null
  return (
    <section aria-labelledby={id}>
      <SectionHeader id={id}>
        {title}
        {items.length > 0 && <span className="tabular"> · {items.length}</span>}
      </SectionHeader>
      {items.length === 0 ? (
        <p className="px-8 text-[15px] text-ink-soft">{empty}</p>
      ) : (
        <ul className={groupedList}>
          {items.map((item) => (
            <Row key={item.key} item={item} />
          ))}
        </ul>
      )}
    </section>
  )
}

const TONE = {
  act: 'font-semibold text-wax',
  wait: 'text-ink-soft',
  done: 'text-moss-deep',
  bad: 'text-ink-soft',
}

function Row({ item }: { item: ActivityItem }) {
  return (
    <li>
      <Link href={item.href} className="flex items-center gap-3 py-3.5 pl-4 pr-2 transition-colors active:bg-paper-sunk">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[17px] leading-snug">{item.title}</p>
          <p className={`mt-1 text-[13px] leading-snug ${TONE[item.tone]}`}>{item.status}</p>
        </div>
        {item.quest && (
          <span className="tabular shrink-0 text-[15px] font-semibold text-moss">
            {formatAmount(item.quest.rewardAmount, item.quest.rewardMint)}
          </span>
        )}
        <ChevronRight className="h-5 w-5 shrink-0 text-ink/25" strokeWidth={2.5} aria-hidden />
      </Link>
      {item.action && (
        <div className="px-4 pb-3.5">
          <Link href={item.action.href} className={`${button()} w-full`}>
            {item.action.label}
          </Link>
        </div>
      )}
    </li>
  )
}
