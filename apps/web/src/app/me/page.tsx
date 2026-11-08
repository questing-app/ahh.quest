'use client'

import Link from 'next/link'
import { useState } from 'react'
import { SiteHeader } from '@/components/site-header'
import { Avatar } from '@/components/avatar'
import { Notice } from '@/components/notice'
import { NameForm } from '@/components/name-form'
import { QuestRow } from '@/components/quest-row'
import { button } from '@/components/button'
import { useMe, useMyFeed } from '@/lib/queries'
import { useSession } from '@/lib/session'
import { displayName, type MyClaim } from '@/lib/types'
import { formatAmount, shortAddress } from '@/lib/tokens'
import { remaining } from '@/lib/time'
import { errorMessage } from '@/lib/api'

export default function ProfilePage() {
  const { ready, authenticated, login, logout } = useSession()
  const me = useMe()
  const mine = useMyFeed()
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)

  if (ready && !authenticated) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-page px-4 py-16 md:px-8">
          <p className="text-[17px]">Sign in to see your quests.</p>
          <button type="button" onClick={login} className={`${button()} mt-6`}>
            Sign in
          </button>
        </main>
      </>
    )
  }

  const user = me.data

  async function copyAddress() {
    if (!user) return
    await navigator.clipboard.writeText(user.pubkey)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-page px-4 py-10 md:px-8">
        {me.error && <Notice tone="error">{errorMessage(me.error)}</Notice>}
        {!user && !me.error && <Notice>Loading…</Notice>}

        {user && (
          <section className="flex flex-col gap-6 border-b border-rule pb-8 sm:flex-row sm:items-start">
            <Avatar person={user} size={72} />
            <div className="min-w-0 flex-1">
              {editing ? (
                <div className="max-w-md">
                  <NameForm user={user} onDone={() => setEditing(false)} />
                </div>
              ) : (
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <h1 className="font-display text-[40px] leading-none">{displayName(user)}</h1>
                  <button type="button" onClick={() => setEditing(true)} className="text-sm text-moss underline-offset-4 hover:underline">
                    Change name
                  </button>
                </div>
              )}
              <p className="mt-3 text-[15px] text-ink-soft">
                Wallet <span className="font-mono text-ink">{shortAddress(user.pubkey)}</span>{' '}
                <button type="button" onClick={copyAddress} className="ml-1 text-moss underline-offset-4 hover:underline">
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </p>
              <p className="tabular mt-1 text-[15px] text-ink-soft">
                {user.questsPosted} posted · {user.questsCompleted} completed · {user.activeClaims} in progress
              </p>
            </div>
          </section>
        )}

        {mine.data && (
          <div className="grid gap-12 py-10 lg:grid-cols-2 lg:gap-16">
            <section aria-labelledby="taken-heading">
              <h2 id="taken-heading" className="font-display text-[26px] leading-none">
                Quests you took
              </h2>
              {mine.data.claims.length === 0 ? (
                <Notice>
                  Nothing yet.{' '}
                  <Link href="/" className="font-semibold text-moss underline underline-offset-4">
                    Find one
                  </Link>
                  .
                </Notice>
              ) : (
                <ul className="mt-4 divide-y divide-rule border-y border-rule">
                  {mine.data.claims.map((claim) => (
                    <ClaimRow key={claim.id} claim={claim} />
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="posted-heading">
              <h2 id="posted-heading" className="font-display text-[26px] leading-none">
                Quests you posted
              </h2>
              {mine.data.quests.length === 0 ? (
                <Notice>
                  You haven’t posted any.{' '}
                  <Link href="/post" className="font-semibold text-moss underline underline-offset-4">
                    Post one
                  </Link>
                  .
                </Notice>
              ) : (
                <ul className="mt-4 divide-y divide-rule border-y border-rule">
                  {mine.data.quests.map((quest) => (
                    <QuestRow key={quest.id} quest={quest} showCreator={false} />
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {authenticated && (
          <button type="button" onClick={logout} className="mt-4 text-sm text-ink-soft underline underline-offset-4 hover:text-ink">
            Sign out
          </button>
        )}
      </main>
    </>
  )
}

function ClaimRow({ claim }: { claim: MyClaim }) {
  const quest = claim.quest
  const left = remaining(claim.proofDeadline)
  const status = {
    active: left ? `Proof due in ${left}` : 'Proof is overdue',
    submitted: 'Video sent, waiting on the result',
    approved: 'Approved and paid',
    rejected: 'Not approved',
    abandoned: 'You gave up',
    expired: 'Ran out of time',
  }[claim.status]

  return (
    <li className="py-5">
      <Link href={`/q/${claim.questId}`} className="text-[17px] font-medium leading-snug hover:underline">
        {quest?.description ?? 'Quest'}
      </Link>
      <p className="mt-1.5 text-sm text-ink-soft">
        {status}
        {quest && ` · ${formatAmount(quest.rewardAmount, quest.rewardMint)}`}
      </p>
      {claim.status === 'active' && left && (
        <Link href={`/q/${claim.questId}/record`} className={`${button('primary', 'sm')} mt-3`}>
          Record your proof
        </Link>
      )}
    </li>
  )
}
