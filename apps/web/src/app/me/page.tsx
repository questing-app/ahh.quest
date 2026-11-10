'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { ChevronRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { SkeletonRows } from '@/components/skeleton'
import { useTokenBalance } from '@/components/token-balance'
import { TOKENS, feeFor, formatUnits, shortAddress } from '@/lib/tokens'
import { openInstallSheet, useStandalone } from '@/components/install-sheet'
import { NavBar } from '@/components/nav-bar'
import { TAB_BAR_SPACE } from '@/components/tab-bar'
import { Avatar } from '@/components/avatar'
import { PhotoPicker } from '@/components/photo-picker'
import { Sheet } from '@/components/sheet'
import { toast } from '@/components/toast'
import { Notice, groupedList } from '@/components/notice'
import { NameForm } from '@/components/name-form'
import { button } from '@/components/button'
import { useMe, useMyFeed } from '@/lib/queries'
import { useApi, useSession } from '@/lib/session'
import { detachPush, disablePush, enablePush, pushState, type PushState } from '@/lib/push'
import { displayName } from '@/lib/types'
import { errorMessage } from '@/lib/api'

const row =
  'flex min-h-[46px] w-full items-center justify-between gap-3 py-2.5 pl-4 pr-2 text-left text-[17px] transition-colors active:bg-paper-sunk'

export default function ProfilePage() {
  const { ready, authenticated, login, logout } = useSession()
  const api = useApi()
  const me = useMe()
  const mine = useMyFeed()
  const [editing, setEditing] = useState(false)
  const standalone = useStandalone()
  const balance = useTokenBalance()
  const token = TOKENS[0]

  // Rewards won, after the fee. Deposits coming back aren't earnings.
  const earned = useMemo(() => {
    if (!mine.data) return null
    let units = 0
    for (const claim of mine.data.claims) {
      if (claim.status !== 'approved' || !claim.quest || claim.quest.rewardMint !== token.mint) continue
      units += claim.quest.rewardAmount - feeFor(claim.quest.rewardAmount)
    }
    return units
  }, [mine.data, token.mint])

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
          {!standalone && (
            <ul className={`${groupedList} mx-0 mt-8 w-full`}>
              <InstallRow />
            </ul>
          )}
        </main>
      </div>
    )
  }

  const user = me.data

  async function copyAddress() {
    if (!user) return
    try {
      await navigator.clipboard.writeText(user.pubkey)
      toast('Wallet address copied')
    } catch {
      toast('Couldn’t copy. Open Wallet to see the full address.')
    }
  }

  return (
    <div className={TAB_BAR_SPACE}>
      <NavBar title="You" large />
      <main>
        {me.error && <Notice tone="error">{errorMessage(me.error)}</Notice>}
        {!user && !me.error && <SkeletonRows count={3} label="Loading your profile" />}

        {user && (
          <>
            <section className="flex items-center gap-3 px-4 pt-1">
              <Avatar person={user} size={58} />
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-[18px] font-bold leading-tight">{displayName(user)}</h1>
                <p className="mt-0.5 text-[14px] text-ink-soft">
                  <span className="font-mono text-[13px]">{shortAddress(user.pubkey)}</span>
                  {' · '}
                  <button type="button" onClick={copyAddress} className="press -my-3 py-3 font-medium text-moss">
                    Copy
                  </button>
                </p>
              </div>
            </section>

            <dl className="tabular mx-4 mt-4 grid grid-cols-3 gap-2">
              <Stat label="Completed" value={String(user.questsCompleted)} />
              <Stat label="Posted" value={String(user.questsPosted)} />
              <Stat label={`${token.symbol} earned`} value={earned === null ? '…' : formatUnits(earned, token.decimals)} />
            </dl>

            <Link
              href="/me/wallet"
              className="press-scale mx-4 mt-3 flex items-center justify-between rounded-[14px] border border-rule bg-paper-raised py-3 pl-4 pr-2"
            >
              <span>
                <span className="block text-[12px] text-ink-soft">Wallet</span>
                <span className="tabular block font-display text-[22px] leading-tight text-moss">
                  {balance.data === undefined ? '…' : formatUnits(balance.data, token.decimals)} {token.symbol}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-ink/25" strokeWidth={2.5} aria-hidden />
            </Link>

            <ul className={`${groupedList} mt-4`}>
              <li>
                <button type="button" onClick={() => setEditing(true)} className={row}>
                  Edit name and photo
                  <Chevron />
                </button>
              </li>
              {!standalone && <InstallRow />}
              <NotificationsRow />
              <li>
                <Link href="/welcome?step=how&next=/me" className={row}>
                  How it works
                  <Chevron />
                </Link>
              </li>
              <li>
                <Link href="/me/help" className={row}>
                  Help and feedback
                  <Chevron />
                </Link>
              </li>
            </ul>

            <Sheet open={editing} onClose={() => setEditing(false)} label="Edit name and photo">
              <h2 className="text-center font-display text-[24px] leading-tight">Name and photo</h2>
              <div className="mt-4">
                <PhotoPicker user={user} size={84} caption removable />
              </div>
              <div className="mt-3">
                <NameForm user={user} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />
              </div>
            </Sheet>
          </>
        )}

        {authenticated && (
          <ul className={`${groupedList} mt-4`}>
            <li>
              <button
                type="button"
                onClick={async () => {
                  // Otherwise this phone keeps getting the old account's notifications.
                  await detachPush(api).catch(() => {})
                  logout()
                }}
                className="min-h-[46px] w-full px-4 py-2.5 text-center text-[17px] text-wax transition-colors active:bg-paper-sunk"
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

function Chevron() {
  return <ChevronRight className="h-5 w-5 shrink-0 text-ink/25" strokeWidth={2.5} aria-hidden />
}

/** Hidden when the server has no push keys or the browser can't do it at all. */
function NotificationsRow() {
  const api = useApi()
  const key = useQuery({
    queryKey: ['push-key'],
    queryFn: () => api<{ publicKey: string | null }>('/api/push/key'),
    staleTime: Infinity,
  })
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    pushState().then(setState, () => setState('unsupported'))
  }, [])

  const publicKey = key.data?.publicKey
  if (!publicKey || !state || state === 'unsupported') return null

  const on = state === 'on'
  const sub =
    state === 'on'
      ? 'On for this phone'
      : state === 'blocked'
        ? 'Blocked. Allow them for Quest in your phone’s settings.'
        : state === 'needs-install'
          ? 'Add Quest to your Home Screen first'
          : 'Know when you’re paid or a video needs your call'

  async function toggle() {
    if (state === 'needs-install') return openInstallSheet()
    if (state === 'blocked' || busy) return
    setBusy(true)
    try {
      if (on) await disablePush(api)
      else await enablePush(api, publicKey!)
    } catch (err) {
      toast(errorMessage(err))
    }
    setState(await pushState().catch(() => 'unsupported' as const))
    setBusy(false)
  }

  const toggles = state === 'on' || state === 'off'

  return (
    <li>
      <button
        type="button"
        onClick={toggle}
        disabled={busy || state === 'blocked'}
        {...(toggles ? { role: 'switch', 'aria-checked': on } : {})}
        className={`${row} ${toggles ? 'pr-4' : ''}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block">Notifications</span>
          <span className="block text-[13px] text-ink-soft">{sub}</span>
        </span>
        {toggles ? (
          <span
            aria-hidden
            className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 ${on ? 'bg-moss' : 'bg-ink/20'} ${busy ? 'opacity-60' : ''}`}
          >
            <span
              className={`absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-sm transition-transform duration-200 ${on ? 'translate-x-5' : ''}`}
            />
          </span>
        ) : (
          state === 'needs-install' && <Chevron />
        )}
      </button>
    </li>
  )
}

function InstallRow() {
  return (
    <li>
      <button type="button" onClick={openInstallSheet} className={row}>
        Add to Home Screen
        <Chevron />
      </button>
    </li>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse rounded-[12px] border border-rule bg-paper-raised px-2 py-2.5 text-center">
      <dt className="truncate text-[11px] text-ink-soft">{label}</dt>
      <dd className="truncate font-display text-[22px] leading-tight text-moss">{value}</dd>
    </div>
  )
}
