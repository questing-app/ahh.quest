'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { NavBar } from '@/components/nav-bar'
import { TAB_BAR_SPACE } from '@/components/tab-bar'
import { Avatar } from '@/components/avatar'
import { Notice, SectionHeader, groupedList } from '@/components/notice'
import { SkeletonRows } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { QuestRow } from '@/components/quest-row'
import { button } from '@/components/button'
import { useQuestsBy, useUser } from '@/lib/queries'
import { displayName, type Quest } from '@/lib/types'
import { shortAddress } from '@/lib/tokens'
import { ApiError, errorMessage } from '@/lib/api'

export default function PublicProfilePage() {
  const { pubkey } = useParams<{ pubkey: string }>()
  const user = useUser(pubkey)
  const quests = useQuestsBy(user.data?.id)

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

  const list = quests.data ?? []
  const open = list.filter((q) => q.status === 'active')
  const past = list.filter((q) => q.status !== 'active')

  return (
    <div className={TAB_BAR_SPACE}>
      <NavBar title={user.data ? displayName(user.data) : 'Profile'} back />
      <main>
        {user.isPending && <SkeletonRows count={3} label="Loading profile" />}
        {user.error && <Notice tone="error">{errorMessage(user.error)}</Notice>}

        {user.data && (
          <>
            <section className="mx-4 flex flex-col items-center rounded-[16px] bg-paper-raised px-5 pb-5 pt-6 text-center">
              <Avatar person={user.data} size={84} />
              <h1 className="mt-3 max-w-full truncate font-display text-[28px] leading-tight">{displayName(user.data)}</h1>
              <p className="mt-1 font-mono text-[13px] text-ink-soft">{shortAddress(user.data.pubkey)}</p>
              <dl className="tabular mt-5 grid w-full grid-cols-3 border-t-[0.5px] border-ink/15 pt-4">
                <Stat label="Posted" value={String(user.data.questsPosted)} />
                <Stat label="Completed" value={String(user.data.questsCompleted)} />
                <Stat label="Pays out" value={quests.data ? paysOut(quests.data) : '…'} />
              </dl>
            </section>
            <p className="px-8 pt-2 text-[13px] leading-relaxed text-ink-soft">
              Pays out: of their quests that got a video, how many paid out.
            </p>

            {quests.isPending && <SkeletonRows count={2} label="Loading quests" />}
            {quests.error && <Notice tone="error">{errorMessage(quests.error)}</Notice>}
            {quests.data && (
              <>
                <QuestSection id="open-quests" title="Open now" quests={open} empty="Nothing open right now." />
                <QuestSection id="past-quests" title="Past quests" quests={past} empty="No past quests yet." />
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}

/** Completed share of quests that reached a decision. */
function paysOut(quests: Quest[]): string {
  const completed = quests.filter((q) => q.status === 'completed').length
  const failed = quests.filter((q) => q.status === 'failed').length
  if (completed + failed === 0) return '—'
  return `${Math.round((completed / (completed + failed)) * 100)}%`
}

function QuestSection({ id, title, quests, empty }: { id: string; title: string; quests: Quest[]; empty: string }) {
  return (
    <section aria-labelledby={id}>
      <SectionHeader id={id}>{title}</SectionHeader>
      {quests.length === 0 ? (
        <p className="px-8 text-[15px] text-ink-soft">{empty}</p>
      ) : (
        <ul className={groupedList}>
          {quests.map((quest) => (
            <QuestRow key={quest.id} quest={quest} showCreator={false} />
          ))}
        </ul>
      )}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-[12px] text-ink-soft">{label}</dt>
      <dd className="text-[20px] font-semibold">{value}</dd>
    </div>
  )
}
