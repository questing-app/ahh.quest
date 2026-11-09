'use client'

import { useParams } from 'next/navigation'
import { NavBar } from '@/components/nav-bar'
import { TAB_BAR_SPACE } from '@/components/tab-bar'
import { Avatar } from '@/components/avatar'
import { Notice, SectionHeader, groupedList } from '@/components/notice'
import { SkeletonRows } from '@/components/skeleton'
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
    <div className={TAB_BAR_SPACE}>
      <NavBar title={user.data ? displayName(user.data) : 'Profile'} back />
      <main>
        {user.isPending && <SkeletonRows count={3} label="Loading profile" />}
        {user.error && <Notice tone="error">{errorMessage(user.error)}</Notice>}

        {user.data && (
          <>
            <section className="flex flex-col items-center px-4 pt-4 text-center">
              <Avatar person={user.data} size={84} />
              <h1 className="mt-3 max-w-full truncate font-display text-[28px] leading-tight">{displayName(user.data)}</h1>
              <p className="tabular mt-1 text-[15px] text-ink-soft">
                <span className="font-mono">{shortAddress(user.data.pubkey)}</span> · {user.data.questsPosted} posted ·{' '}
                {user.data.questsCompleted} completed
              </p>
            </section>

            <SectionHeader id="their-quests">Quests posted</SectionHeader>
            {quests.isPending && <SkeletonRows count={2} label="Loading quests" />}
            {quests.data?.length === 0 && <p className="px-8 text-[13px] text-ink-soft">None yet.</p>}
            {quests.data && quests.data.length > 0 && (
              <ul className={groupedList} aria-labelledby="their-quests">
                {quests.data.map((quest) => (
                  <QuestRow key={quest.id} quest={quest} showCreator={false} />
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  )
}
