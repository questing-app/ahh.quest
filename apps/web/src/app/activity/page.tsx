'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Check, ChevronRight, Clock, Hourglass, Play, Video, X } from 'lucide-react'
import { NavBar } from '@/components/nav-bar'
import { TAB_BAR_SPACE } from '@/components/tab-bar'
import { Notice, SectionHeader, groupedList } from '@/components/notice'
import { SkeletonRows } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { Segmented } from '@/components/segmented'
import { button } from '@/components/button'
import { useMyFeed } from '@/lib/queries'
import { useSession } from '@/lib/session'
import { buildActivity, type ActivityItem } from '@/lib/activity'
import { errorMessage } from '@/lib/api'

type Show = 'needs' | 'all'

export default function ActivityPage() {
  const { ready, authenticated, login } = useSession()
  const mine = useMyFeed()
  const activity = useMemo(() => (mine.data ? buildActivity(mine.data) : null), [mine.data])
  const [show, setShow] = useState<Show>('all')

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
  const waiting = activity?.needsYou.length ?? 0

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
            <Segmented
              label="Show"
              className="mx-4 mt-1"
              value={show}
              onChange={setShow}
              options={[
                { id: 'needs', label: waiting > 0 ? `Needs you · ${waiting}` : 'Needs you' },
                { id: 'all', label: 'All' },
              ]}
            />
            <Group id="needs-you" title="Needs you" items={activity.needsYou} empty="You’re all caught up." />
            {show === 'all' && (
              <>
                <Group id="in-progress" title="In progress" items={activity.inProgress} />
                <Group id="done" title="Done" items={activity.done} />
              </>
            )}
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
      <SectionHeader id={id}>{title}</SectionHeader>
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

const TILE: Record<ActivityItem['kind'], { icon: typeof Check; className: string }> = {
  review: { icon: Play, className: 'bg-night text-paper-raised' },
  film: { icon: Video, className: 'bg-[#F3E3C4] text-[#6E4310]' },
  waiting: { icon: Hourglass, className: 'bg-paper-sunk text-ink-soft' },
  checking: { icon: Clock, className: 'bg-paper-sunk text-ink-soft' },
  paid: { icon: Check, className: 'bg-moss-pale text-moss-deep' },
  ended: { icon: X, className: 'bg-paper-sunk text-ink-soft' },
}

function Row({ item }: { item: ActivityItem }) {
  const tile = TILE[item.kind]
  const Icon = tile.icon
  return (
    <li>
      <Link href={item.href} className="flex items-center gap-3 py-3 pl-4 pr-2 transition-colors active:bg-paper-sunk">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${tile.className}`} aria-hidden>
          <Icon className="h-[18px] w-[18px]" strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold leading-snug">{item.title}</p>
          <p className="tabular mt-0.5 flex text-[13px] leading-snug text-ink-soft">
            <span className="min-w-0 truncate">{item.dare}</span>
            <span className="shrink-0 whitespace-pre">
              {' · '}
              <span className={item.urgent ? 'font-semibold text-[#6E4310]' : ''}>{item.detail}</span>
            </span>
          </p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-ink/25" strokeWidth={2.5} aria-hidden />
      </Link>
    </li>
  )
}
