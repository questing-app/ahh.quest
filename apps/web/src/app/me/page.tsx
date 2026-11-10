'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Bell, ChevronRight, Inbox, SquarePlus, Wallet, CircleHelp } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { SkeletonRows } from '@/components/skeleton'
import { useTokenBalance } from '@/components/token-balance'
import { TOKENS, formatUnits } from '@/lib/tokens'
import { openInstallSheet, useStandalone } from '@/components/install-sheet'
import { NavBar } from '@/components/nav-bar'
import { TAB_BAR_SPACE } from '@/components/tab-bar'
import { PhotoPicker } from '@/components/photo-picker'
import { toast } from '@/components/toast'
import { Notice, groupedList } from '@/components/notice'
import { NameForm } from '@/components/name-form'
import { button } from '@/components/button'
import { useMe } from '@/lib/queries'
import { useApi, useSession } from '@/lib/session'
import { detachPush, disablePush, enablePush, pushState, type PushState } from '@/lib/push'
import { displayName } from '@/lib/types'
import { errorMessage } from '@/lib/api'

export default function ProfilePage() {
  const { ready, authenticated, login, logout } = useSession()
  const api = useApi()
  const me = useMe()
  const [editing, setEditing] = useState(false)
  const standalone = useStandalone()
  const balance = useTokenBalance()

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
  const token = TOKENS[0]

  return (
    <div className={TAB_BAR_SPACE}>
      <NavBar title="You" large />
      <main>
        {me.error && <Notice tone="error">{errorMessage(me.error)}</Notice>}
        {!user && !me.error && <SkeletonRows count={3} label="Loading your profile" />}

        {user && (
          <>
            <section className="mx-4 flex flex-col items-center rounded-[16px] bg-paper-raised px-5 pb-5 pt-6 text-center">
              <PhotoPicker user={user} size={84} removable={editing} />
              {editing ? (
                <div className="mt-4 w-full text-left">
                  <NameForm user={user} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />
                </div>
              ) : (
                <>
                  <h1 className="mt-3 max-w-full truncate font-display text-[28px] leading-tight">{displayName(user)}</h1>
                  <button type="button" onClick={() => setEditing(true)} className="press h-11 px-3 text-[15px] text-moss">
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

            <ul className={`${groupedList} mt-8`}>
              <NavRow
                href="/me/wallet"
                icon={<Wallet className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />}
                label="Wallet"
                detail={
                  balance.data === undefined ? '…' : `${formatUnits(balance.data, token.decimals)} ${token.symbol}`
                }
              />
              <NavRow
                href="/activity"
                icon={<Inbox className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />}
                label="Your quests"
                sub="Posted and taken quests are in Activity"
              />
              <NavRow
                href="/welcome?step=how&next=/me"
                icon={<CircleHelp className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />}
                label="How it works"
              />
              <NotificationsRow />
              {!standalone && <InstallRow />}
            </ul>
          </>
        )}

        {authenticated && (
          <ul className={`${groupedList} mt-8`}>
            <li>
              <button
                type="button"
                onClick={async () => {
                  // Otherwise this phone keeps getting the old account's notifications.
                  await detachPush(api).catch(() => {})
                  logout()
                }}
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

function RowIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-[29px] w-[29px] shrink-0 items-center justify-center rounded-[7px] bg-moss text-paper-raised">
      {children}
    </span>
  )
}

function NavRow({
  href,
  icon,
  label,
  detail,
  sub,
}: {
  href: string
  icon: React.ReactNode
  label: string
  detail?: string
  sub?: string
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-[44px] items-center gap-3 py-2.5 pl-3 pr-2 text-[17px] transition-colors active:bg-paper-sunk"
      >
        <RowIcon>{icon}</RowIcon>
        <span className="min-w-0 flex-1">
          <span className="block">{label}</span>
          {sub && <span className="block text-[13px] text-ink-soft">{sub}</span>}
        </span>
        {detail && <span className="tabular shrink-0 text-ink-soft">{detail}</span>}
        <ChevronRight className="h-5 w-5 shrink-0 text-ink/25" strokeWidth={2.5} aria-hidden />
      </Link>
    </li>
  )
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
        className="flex min-h-[44px] w-full items-center gap-3 py-2.5 pl-3 pr-4 text-left text-[17px] transition-colors active:bg-paper-sunk"
      >
        <RowIcon>
          <Bell className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
        </RowIcon>
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
          state === 'needs-install' && <ChevronRight className="-mr-2 h-5 w-5 shrink-0 text-ink/25" strokeWidth={2.5} aria-hidden />
        )}
      </button>
    </li>
  )
}

function InstallRow() {
  return (
    <li>
      <button
        type="button"
        onClick={openInstallSheet}
        className="flex min-h-[44px] w-full items-center gap-3 py-2.5 pl-3 pr-2 text-left text-[17px] transition-colors active:bg-paper-sunk"
      >
        <RowIcon>
          <SquarePlus className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
        </RowIcon>
        <span className="flex-1">Add to Home Screen</span>
        <ChevronRight className="h-5 w-5 shrink-0 text-ink/25" strokeWidth={2.5} aria-hidden />
      </button>
    </li>
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
