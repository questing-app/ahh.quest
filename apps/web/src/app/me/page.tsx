'use client'

import Link from 'next/link'
import { useState } from 'react'
import Image from 'next/image'
import { ChevronRight, SquarePlus } from 'lucide-react'
import { openInstallSheet, useStandalone } from '@/components/install-sheet'
import { NavBar } from '@/components/nav-bar'
import { TAB_BAR_SPACE } from '@/components/tab-bar'
import { Avatar } from '@/components/avatar'
import { Notice, SectionHeader, groupedList } from '@/components/notice'
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
  const standalone = useStandalone()

  if (ready && !authenticated) {
    return (
      <div className={TAB_BAR_SPACE}>
        <NavBar title="You" large />
        <main className="flex flex-col items-center px-8 pt-4 text-center">
          <Image src="/art/profile.png" alt="" width={390} height={320} className="art-fade w-full max-w-[260px]" />
          <p className="mt-2 text-[17px] leading-relaxed text-ink-soft">
            Sign in to post quests, take them on, and keep what you win.
          </p>
          <button type="button" onClick={login} className={`${button()} mt-6 w-full`}>
            Sign in
          </button>
          {!standalone && <InstallRow className="mt-8 w-full" />}
        </main>
      </div>
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
    <div className={TAB_BAR_SPACE}>
      <NavBar title="You" large />
      <main>
        {me.error && <Notice tone="error">{errorMessage(me.error)}</Notice>}
        {!user && !me.error && <Notice>Loading…</Notice>}

        {user && (
          <>
            <section className="mx-4 flex flex-col items-center rounded-[16px] bg-paper-raised px-5 pb-5 pt-6 text-center">
              <Avatar person={user} size={84} />
              {editing ? (
                <div className="mt-4 w-full text-left">
                  <NameForm user={user} onDone={() => setEditing(false)} />
                </div>
              ) : (
                <>
                  <h1 className="mt-3 max-w-full truncate font-display text-[28px] leading-tight">{displayName(user)}</h1>
                  <button type="button" onClick={() => setEditing(true)} className="press mt-1 text-[15px] text-moss">
                    Edit name
                  </button>
                </>
              )}
              <dl className="tabular mt-5 grid w-full grid-cols-3 border-t-[0.5px] border-ink/15 pt-4">
                <Stat label="Posted" value={user.questsPosted} />
                <Stat label="Completed" value={user.questsCompleted} />
                <Stat label="Active" value={user.activeClaims} />
              </dl>
            </section>

            <ul className={`${groupedList} mt-6`}>
              <li>
                <button
                  type="button"
                  onClick={copyAddress}
                  className="flex min-h-[44px] w-full items-center justify-between gap-4 px-4 py-2.5 text-[17px] transition-colors active:bg-paper-sunk"
                >
                  <span>Wallet</span>
                  <span className="font-mono text-[15px] text-ink-soft">
                    {copied ? 'Copied' : shortAddress(user.pubkey)}
                  </span>
                </button>
              </li>
            </ul>
          </>
        )}

        {mine.data && (
          <>
            <SectionHeader id="taken-heading">Quests you took</SectionHeader>
            {mine.data.claims.length === 0 ? (
              <p className="px-8 text-[13px] text-ink-soft">
                Nothing yet.{' '}
                <Link href="/" className="text-moss">
                  Find one
                </Link>
              </p>
            ) : (
              <ul className={groupedList} aria-labelledby="taken-heading">
                {mine.data.claims.map((claim) => (
                  <ClaimRow key={claim.id} claim={claim} />
                ))}
              </ul>
            )}

            <SectionHeader id="posted-heading">Quests you posted</SectionHeader>
            {mine.data.quests.length === 0 ? (
              <p className="px-8 text-[13px] text-ink-soft">
                You haven’t posted any.{' '}
                <Link href="/post" className="text-moss">
                  Post one
                </Link>
              </p>
            ) : (
              <ul className={groupedList} aria-labelledby="posted-heading">
                {mine.data.quests.map((quest) => (
                  <QuestRow key={quest.id} quest={quest} showCreator={false} />
                ))}
              </ul>
            )}
          </>
        )}

        {!standalone && <InstallRow className="mx-4 mt-8" />}

        {authenticated && (
          <ul className={`${groupedList} mt-8`}>
            <li>
              <button
                type="button"
                onClick={logout}
                className="min-h-[44px] w-full px-4 py-2.5 text-center text-[17px] text-wax transition-colors active:bg-paper-sunk"
              >
                Sign out
              </button>
            </li>
          </ul>
        )}
      </main>
    </div>
  )
}

function InstallRow({ className = '' }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={openInstallSheet}
      className={`flex min-h-[44px] items-center gap-3 rounded-[12px] bg-paper-raised py-2.5 pl-3 pr-2 text-left text-[17px] transition-colors active:bg-paper-sunk ${className}`}
    >
      <span className="flex h-[29px] w-[29px] shrink-0 items-center justify-center rounded-[7px] bg-moss text-paper-raised">
        <SquarePlus className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
      </span>
      <span className="flex-1">Add to Home Screen</span>
      <ChevronRight className="h-5 w-5 shrink-0 text-ink/25" strokeWidth={2.5} aria-hidden />
    </button>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dd className="text-[20px] font-semibold">{value}</dd>
      <dt className="text-[12px] text-ink-soft">{label}</dt>
    </div>
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
    <li>
      <Link
        href={`/q/${claim.questId}`}
        className="flex items-center gap-3 py-3.5 pl-4 pr-2 transition-colors active:bg-paper-sunk"
      >
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[17px] leading-snug">{quest?.description ?? 'Quest'}</p>
          <p className={`mt-1 truncate text-[13px] ${claim.status === 'active' ? 'font-semibold text-moss' : 'text-ink-soft'}`}>
            {status}
            {quest && ` · ${formatAmount(quest.rewardAmount, quest.rewardMint)}`}
          </p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-ink/25" strokeWidth={2.5} aria-hidden />
      </Link>
      {claim.status === 'active' && left && (
        <div className="px-4 pb-3.5">
          <Link href={`/q/${claim.questId}/record`} className={`${button()} w-full`}>
            Record your proof
          </Link>
        </div>
      )}
    </li>
  )
}
