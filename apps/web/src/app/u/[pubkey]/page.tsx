'use client'

import { useParams } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { Avatar } from '@/components/avatar'
import { Notice } from '@/components/notice'
import { QuestRow } from '@/components/quest-row'
import { useQuestsBy, useUser } from '@/lib/queries'
import { displayName } from '@/lib/types'
import { shortAddress } from '@/lib/tokens'
import { errorMessage } from '@/lib/api'

export default function PublicProfilePage() {
  const { pubkey } = useParams<{ pubkey: string }>()
  const user = useUser(pubkey)
  const quests = useQuestsBy(user.data?.id)

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-page px-4 py-10 md:px-8">
        {user.isPending && <Notice>Loading…</Notice>}
        {user.error && <Notice tone="error">{errorMessage(user.error)}</Notice>}

        {user.data && (
          <>
            <section className="flex items-center gap-5 border-b border-rule pb-8">
              <Avatar person={user.data} size={64} />
              <div>
                <h1 className="font-display text-[36px] leading-none">{displayName(user.data)}</h1>
                <p className="tabular mt-2 text-[15px] text-ink-soft">
                  <span className="font-mono">{shortAddress(user.data.pubkey)}</span> · {user.data.questsPosted} posted ·{' '}
                  {user.data.questsCompleted} completed
                </p>
              </div>
            </section>

            <section className="py-10" aria-labelledby="their-quests">
              <h2 id="their-quests" className="font-display text-[26px] leading-none">
                Quests posted
              </h2>
              {quests.data?.length === 0 && <Notice>None yet.</Notice>}
              {quests.data && quests.data.length > 0 && (
                <ul className="mt-4 divide-y divide-rule border-y border-rule">
                  {quests.data.map((quest) => (
                    <QuestRow key={quest.id} quest={quest} showCreator={false} />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </>
  )
}
