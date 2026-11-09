'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { NavBar } from '@/components/nav-bar'
import { TAB_BAR_SPACE } from '@/components/tab-bar'
import { Avatar } from '@/components/avatar'
import { Notice, SectionHeader, groupedList } from '@/components/notice'
import { RewardPanel } from '@/components/reward-panel'
import { Attempts } from '@/components/attempts'
import { questAvailability } from '@/components/quest-row'
import { useMe, useQuest, useQuestClaims } from '@/lib/queries'
import { displayName } from '@/lib/types'
import { formatDate, remaining, timeAgo } from '@/lib/time'
import { shortAddress } from '@/lib/tokens'
import { errorMessage } from '@/lib/api'
import { explorerAddress } from '@/lib/chain'

export default function QuestPage() {
  const { id } = useParams<{ id: string }>()
  const quest = useQuest(id)
  const claims = useQuestClaims(id)
  const { data: me } = useMe()

  return (
    <div className={TAB_BAR_SPACE}>
      <NavBar title="Quest" back="Quests" />
      <main>
        {quest.isPending && <Notice>Loading…</Notice>}
        {quest.error && <Notice tone="error">{errorMessage(quest.error)}</Notice>}

        {quest.data && (
          <>
            <article className="px-4 pb-5 pt-2">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-moss">
                {questAvailability(quest.data)}
              </p>
              <h1 className="mt-2 font-display text-[30px] leading-[1.12]">{quest.data.description}</h1>

              <Link
                href={quest.data.creator ? `/u/${quest.data.creator.pubkey}` : '#'}
                className="press mt-4 flex items-center gap-2.5 text-[15px]"
              >
                <Avatar person={quest.data.creator} size={28} />
                <p className="min-w-0 truncate">
                  <span className="font-semibold">{displayName(quest.data.creator)}</span>
                  <span className="text-ink-soft"> · {timeAgo(quest.data.createdAt)}</span>
                </p>
              </Link>
            </article>

            <RewardPanel quest={quest.data} claims={claims.data ?? []} me={me} />

            <SectionHeader>Details</SectionHeader>
            <dl className={groupedList}>
              <Fact label="Who can take it">
                {quest.data.questType === 'direct' && quest.data.targetPubkey
                  ? `Only ${shortAddress(quest.data.targetPubkey)}`
                  : 'Anyone'}
              </Fact>
              <Fact label="Ends">
                {quest.data.deadline
                  ? remaining(quest.data.deadline)
                    ? `${remaining(quest.data.deadline)} left`
                    : formatDate(quest.data.deadline)
                  : 'No end date'}
              </Fact>
              <Fact label="Proof due">24h after claiming</Fact>
              <Fact label="Video">One take, 15–60s</Fact>
              {quest.data.escrowPda && (
                <Fact label="Reward held by">
                  <a
                    href={explorerAddress(quest.data.escrowPda)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-moss"
                  >
                    Escrow {shortAddress(quest.data.escrowPda)}
                  </a>
                </Fact>
              )}
            </dl>

            <SectionHeader>How it’s judged</SectionHeader>
            <p className="px-8 text-[13px] leading-relaxed text-ink-soft">
              The video is checked frame by frame against the description, along with anything said out loud. A
              clear pass pays out straight away and a clear fail is rejected. Anything in between goes to{' '}
              {displayName(quest.data.creator)}, who has 24 hours to decide. If they don’t, it’s approved.
            </p>

            {claims.data && (
              <Attempts questId={id} claims={claims.data} viewerIsCreator={me?.id === quest.data.creatorId} />
            )}
          </>
        )}
      </main>
    </div>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-4 px-4 py-2.5 text-[17px]">
      <dt className="shrink-0">{label}</dt>
      <dd className="min-w-0 truncate text-right text-ink-soft">{children}</dd>
    </div>
  )
}
