'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import { Share } from 'lucide-react'
import { NavBar } from '@/components/nav-bar'
import { TAB_BAR_SPACE } from '@/components/tab-bar'
import { Avatar } from '@/components/avatar'
import { Notice } from '@/components/notice'
import { SkeletonCards, SkeletonRows } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { QuestRow, questList } from '@/components/quest-row'
import { Segmented } from '@/components/segmented'
import { button } from '@/components/button'
import { useQuestsBy, useQuestsWonBy, useUser } from '@/lib/queries'
import { displayName, type Quest } from '@/lib/types'
import { monthYear } from '@/lib/time'
import { shareLink } from '@/lib/share'
import { ApiError, errorMessage } from '@/lib/api'

type Tab = 'posted' | 'completed'

export default function PublicProfilePage() {
  const { pubkey } = useParams<{ pubkey: string }>()
  const user = useUser(pubkey)
  const posted = useQuestsBy(user.data?.id)
  const won = useQuestsWonBy(user.data?.id)
  const [tab, setTab] = useState<Tab>('posted')

  if (user.error instanceof ApiError && user.error.status === 404) {
    return (
      <div className={TAB_BAR_SPACE}>
        <NavBar title="Profile" back />
        <EmptyState
          art="/art/notfound.jpg"
          title="Profile not found"
          body="Nobody on Quest uses this wallet, or the link is mistyped."
        >
          <Link href="/" className={`${button()} w-full`}>
            See open quests
          </Link>
        </EmptyState>
      </div>
    )
  }

  const name = user.data ? displayName(user.data) : 'Profile'
  const shown = tab === 'posted' ? posted : won

  return (
    <div className={TAB_BAR_SPACE}>
      <NavBar
        title=""
        back
        right={
          user.data ? (
            <button
              type="button"
              aria-label="Share profile"
              onClick={() => shareLink(window.location.href, `${name} on Quest`)}
              className="press flex h-11 w-11 items-center justify-center text-moss"
            >
              <Share className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden />
            </button>
          ) : null
        }
      />
      <main>
        {user.isPending && <SkeletonRows count={3} label="Loading profile" />}
        {user.error && <Notice tone="error">{errorMessage(user.error)}</Notice>}

        {user.data && (
          <>
            <section className="flex flex-col items-center px-4 pt-1 text-center">
              <Avatar person={user.data} size={84} />
              <h1 className="mt-3 max-w-full truncate font-display text-[28px] leading-tight">{name}</h1>
              <p className="mt-1 text-[15px] text-ink-soft">Questing since {monthYear(user.data.createdAt)}</p>
            </section>

            <dl className="tabular mx-4 mt-5 grid grid-cols-3 rounded-[16px] bg-paper-raised py-3.5 text-center">
              <Stat label="Completed" value={String(user.data.questsCompleted)} />
              <Stat label="Posted" value={String(user.data.questsPosted)} />
              <Stat label="Pays out" value={posted.data ? paysOut(posted.data) : '…'} />
            </dl>
            <p className="px-8 pt-2 text-[13px] leading-relaxed text-ink-soft">
              Pays out: of their quests that got a video, how many were approved.
            </p>

            <Segmented
              label="Quests"
              className="mx-4 mt-5"
              value={tab}
              onChange={setTab}
              options={[
                { id: 'posted', label: 'Posted' },
                { id: 'completed', label: 'Completed' },
              ]}
            />

            <div className="pt-3">
              {shown.isPending && <SkeletonCards label="Loading quests" />}
              {shown.error && <Notice tone="error">{errorMessage(shown.error)}</Notice>}
              {shown.data && shown.data.length === 0 && (
                <p className="px-8 pt-3 text-center text-[15px] text-ink-soft">
                  {tab === 'posted' ? 'No quests posted yet.' : 'No quests completed yet.'}
                </p>
              )}
              {shown.data && shown.data.length > 0 && (
                <ul className={questList}>
                  {shown.data.map((quest) => (
                    <QuestRow key={quest.id} quest={quest} showCreator={tab === 'completed'} />
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

/** Approved share of quests that reached a decision. */
function paysOut(quests: Quest[]): string {
  const completed = quests.filter((q) => q.status === 'completed').length
  const failed = quests.filter((q) => q.status === 'failed').length
  if (completed + failed === 0) return '—'
  return `${Math.round((completed / (completed + failed)) * 100)}%`
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-[12px] text-ink-soft">{label}</dt>
      <dd className="text-[20px] font-semibold">{value}</dd>
    </div>
  )
}
