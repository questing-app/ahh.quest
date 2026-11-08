'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { Avatar } from '@/components/avatar'
import { Notice } from '@/components/notice'
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
    <>
      <SiteHeader />
      <main className="mx-auto max-w-page px-4 py-8 md:px-8 md:py-10">
        <Link href="/" className="text-sm text-ink-soft hover:text-ink">
          ← All quests
        </Link>

        {quest.isPending && <Notice>Loading…</Notice>}
        {quest.error && <Notice tone="error">{errorMessage(quest.error)}</Notice>}

        {quest.data && (
          <div className="mt-6 grid gap-10 md:grid-cols-[minmax(0,1fr)_340px] md:gap-14">
            <article>
              <p className="text-sm font-semibold text-moss">{questAvailability(quest.data)}</p>
              <h1 className="mt-2 font-display text-[34px] leading-[1.1] md:text-[44px]">{quest.data.description}</h1>

              <div className="mt-5 flex items-center gap-3 text-[15px]">
                <Avatar person={quest.data.creator} size={30} />
                <p>
                  Posted by{' '}
                  {quest.data.creator ? (
                    <Link href={`/u/${quest.data.creator.pubkey}`} className="font-semibold hover:underline">
                      {displayName(quest.data.creator)}
                    </Link>
                  ) : (
                    'someone'
                  )}
                  <span className="text-ink-soft"> · {timeAgo(quest.data.createdAt)}</span>
                </p>
              </div>

              <dl className="mt-8 grid gap-x-8 gap-y-5 border-t border-rule pt-6 text-[15px] sm:grid-cols-2">
                <Fact label="Who can take it">
                  {quest.data.questType === 'direct' && quest.data.targetPubkey
                    ? `Only ${shortAddress(quest.data.targetPubkey)}`
                    : 'Anyone, one at a time'}
                </Fact>
                <Fact label="Quest ends">
                  {quest.data.deadline
                    ? `${formatDate(quest.data.deadline)}${remaining(quest.data.deadline) ? ` (${remaining(quest.data.deadline)} left)` : ''}`
                    : 'No end date'}
                </Fact>
                <Fact label="Proof due">Within 24 hours of claiming</Fact>
                <Fact label="Video">One take, 15 to 60 seconds</Fact>
                {quest.data.escrowPda && (
                  <Fact label="Reward held by">
                    <a
                      href={explorerAddress(quest.data.escrowPda)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-moss underline-offset-4 hover:underline"
                    >
                      Solana escrow {shortAddress(quest.data.escrowPda)}
                    </a>
                  </Fact>
                )}
              </dl>

              <section className="mt-10 max-w-[38rem]">
                <h2 className="font-display text-[22px] leading-none">How it’s judged</h2>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
                  The video is checked frame by frame against the description above, along with anything
                  said out loud. A clear pass pays out straight away and a clear fail is rejected. Anything
                  in between goes to {displayName(quest.data.creator)}, who has 24 hours to decide. If they
                  don’t, it’s approved.
                </p>
              </section>

              {claims.data && (
                <Attempts questId={id} claims={claims.data} viewerIsCreator={me?.id === quest.data.creatorId} />
              )}
            </article>

            <aside>
              <RewardPanel quest={quest.data} claims={claims.data ?? []} me={me} />
            </aside>
          </div>
        )}
      </main>
    </>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  )
}
