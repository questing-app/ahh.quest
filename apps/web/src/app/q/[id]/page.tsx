'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { NavBar } from '@/components/nav-bar'
import { TAB_BAR_SPACE } from '@/components/tab-bar'
import { Avatar } from '@/components/avatar'
import { Notice, SectionHeader, groupedList } from '@/components/notice'
import { SkeletonQuest } from '@/components/skeleton'
import { MAX_SECONDS, MIN_SECONDS } from '@/lib/proof'
import { RewardPanel } from '@/components/reward-panel'
import { Attempts } from '@/components/attempts'
import { questAvailability } from '@/components/quest-row'
import { useMe, useQuest, useQuestClaims } from '@/lib/queries'
import { displayName, type Quest } from '@/lib/types'
import { formatDate, remaining, timeAgo } from '@/lib/time'
import { shortAddress } from '@/lib/tokens'
import { ApiError, errorMessage } from '@/lib/api'
import { explorerAddress } from '@/lib/chain'
import { button } from '@/components/button'

export default function QuestPage() {
  const { id } = useParams<{ id: string }>()
  const quest = useQuest(id)
  const claims = useQuestClaims(id)
  const { data: me } = useMe()

  return (
    <div className={TAB_BAR_SPACE}>
      <NavBar title="Quest" back="Quests" />
      <main>
        {quest.isPending && <SkeletonQuest />}
        {quest.error && (
          <div className="px-4 text-center">
            <Notice tone="error">
              {quest.error instanceof ApiError && quest.error.status === 404
                ? 'This quest doesn’t exist or was taken down.'
                : errorMessage(quest.error)}
            </Notice>
            <Link href="/" className={`${button('outline')} -mt-6 w-full`}>
              See open quests
            </Link>
          </div>
        )}

        {quest.data && (
          <>
            <article className="px-4 pb-5 pt-2">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-moss">
                {questAvailability(quest.data)}
              </p>
              <h1 className="mt-2 font-display text-[30px] leading-[1.12]">{quest.data.description}</h1>

              {quest.data.creator ? (
                <Link
                  href={`/u/${quest.data.creator.pubkey}`}
                  className="press mt-4 flex min-h-[44px] items-center gap-2.5 text-[15px]"
                >
                  <Creator quest={quest.data} />
                </Link>
              ) : (
                <div className="mt-4 flex min-h-[44px] items-center gap-2.5 text-[15px]">
                  <Creator quest={quest.data} />
                </div>
              )}
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
              <Fact label="Time to film">24 hours once taken</Fact>
              <Fact label="Video">One take, {MIN_SECONDS}–{MAX_SECONDS} seconds</Fact>
              {quest.data.escrowPda && (
                <Fact label="Reward">
                  <a
                    href={explorerAddress(quest.data.escrowPda)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-moss"
                  >
                    Locked on-chain ↗
                  </a>
                </Fact>
              )}
            </dl>

            <SectionHeader>How it’s judged</SectionHeader>
            <p className="px-8 text-[13px] leading-relaxed text-ink-soft">
              The video is checked against the description. A clear pass pays out right away and a clear fail is
              rejected. Close calls go to {displayName(quest.data.creator)}, who has 24 hours to decide, or it’s
              approved.
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

function Creator({ quest }: { quest: Quest }) {
  return (
    <>
      <Avatar person={quest.creator} size={28} />
      <p className="min-w-0 truncate">
        <span className="font-semibold">{displayName(quest.creator)}</span>
        <span className="text-ink-soft"> · posted {timeAgo(quest.createdAt)}</span>
      </p>
    </>
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
