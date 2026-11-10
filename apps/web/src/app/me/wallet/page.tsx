'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { ChevronRight, Copy } from 'lucide-react'
import { NavBar } from '@/components/nav-bar'
import { TAB_BAR_SPACE } from '@/components/tab-bar'
import { Notice, SectionHeader, groupedList } from '@/components/notice'
import { SkeletonRows } from '@/components/skeleton'
import { TokenBalance, useTokenBalance } from '@/components/token-balance'
import { button } from '@/components/button'
import { toast } from '@/components/toast'
import { useMe, useMyFeed } from '@/lib/queries'
import { useSession } from '@/lib/session'
import { CLUSTER, explorerAddress } from '@/lib/chain'
import { TOKENS, feeFor, formatUnits, shortAddress, tokenForMint } from '@/lib/tokens'
import { timeAgo } from '@/lib/time'
import { errorMessage } from '@/lib/api'
import type { MyFeed } from '@/lib/types'

type Entry = { key: string; questId: string; label: string; detail: string; units: number; mint: string; at: number }

/** Money movements we know about from Quest itself, newest first. */
function entriesFrom(feed: MyFeed): Entry[] {
  const out: Entry[] = []
  for (const q of feed.quests) {
    out.push({
      key: `lock-${q.id}`,
      questId: q.id,
      label: 'Locked for a quest',
      detail: q.description,
      units: -q.rewardAmount,
      mint: q.rewardMint,
      at: q.createdAt,
    })
    if (q.status === 'cancelled' || q.status === 'expired' || q.status === 'failed') {
      out.push({
        key: `back-${q.id}`,
        questId: q.id,
        label: 'Reward came back',
        detail: q.description,
        units: q.rewardAmount,
        mint: q.rewardMint,
        // Quests closed before settle times were recorded fall back to the deadline.
        at: q.closedAt ?? q.deadline ?? q.createdAt,
      })
    }
  }
  for (const c of feed.claims) {
    const mint = c.quest?.rewardMint ?? TOKENS[0].mint
    const detail = c.quest?.description ?? 'Quest'
    const lost = c.status === 'rejected' || c.status === 'expired' || c.status === 'abandoned'
    out.push({
      key: `stake-${c.id}`,
      questId: c.questId,
      label: lost ? 'Deposit lost on a quest' : 'Deposit to take a quest',
      detail,
      units: -c.stakeAmount,
      mint,
      at: c.claimedAt,
    })
    if (c.status === 'approved' && c.quest) {
      out.push({
        key: `paid-${c.id}`,
        questId: c.questId,
        label: 'Paid for a quest',
        detail,
        units: c.quest.rewardAmount - feeFor(c.quest.rewardAmount) + c.stakeAmount,
        mint,
        at: c.settledAt ?? c.reviewDeadline ?? c.proofDeadline,
      })
    }
  }
  const mine = new Map(feed.quests.map((q) => [q.id, q]))
  for (const k of feed.kept ?? []) {
    const quest = mine.get(k.questId)
    out.push({
      key: `kept-${k.id}`,
      questId: k.questId,
      label: 'Kept a deposit',
      detail: quest?.description ?? 'Quest',
      units: k.stakeAmount,
      mint: quest?.rewardMint ?? TOKENS[0].mint,
      at: k.settledAt ?? k.claimedAt,
    })
  }
  return out.sort((a, b) => b.at - a.at)
}

export default function WalletPage() {
  const { ready, authenticated, login } = useSession()
  const me = useMe()
  const mine = useMyFeed()
  const balance = useTokenBalance()
  const token = TOKENS[0]
  const entries = useMemo(() => (mine.data ? entriesFrom(mine.data) : []), [mine.data])

  const nav = <NavBar title="Wallet" back="You" backHref="/me" />

  if (ready && !authenticated) {
    return (
      <div className={TAB_BAR_SPACE}>
        {nav}
        <main className="px-8 pt-8 text-center">
          <p className="text-[17px] leading-relaxed text-ink-soft">Sign in to see your wallet.</p>
          <button type="button" onClick={login} className={`${button()} mt-6 w-full`}>
            Sign in
          </button>
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
      toast('Couldn’t copy. Long-press the address instead.')
    }
  }

  return (
    <div className={TAB_BAR_SPACE}>
      {nav}
      <main>
        {me.error && <Notice tone="error">{errorMessage(me.error)}</Notice>}
        {!user && !me.error && <SkeletonRows count={2} label="Loading your wallet" />}

        {user && (
          <>
            <section className="mx-4 rounded-[16px] bg-paper-raised px-5 pb-5 pt-5">
              <p className="text-[13px] uppercase tracking-wide text-ink-soft">
                Balance{CLUSTER === 'devnet' && ' · test QUEST'}
              </p>
              <p className="mt-1 leading-none">
                <span className="tabular font-display text-[46px] text-moss">
                  {balance.data === undefined ? '…' : formatUnits(balance.data, token.decimals)}
                </span>{' '}
                <span className="text-lg font-semibold">{token.symbol}</span>
              </p>
              {CLUSTER === 'devnet' && (
                <div className="mt-4 border-t-[0.5px] border-ink/15 pt-4">
                  <TokenBalance />
                </div>
              )}
            </section>

            <ul className={`${groupedList} mt-6`}>
              <li>
                <button
                  type="button"
                  onClick={copyAddress}
                  className="flex min-h-[44px] w-full items-center justify-between gap-4 px-4 py-2.5 text-[17px] transition-colors active:bg-paper-sunk"
                >
                  <span>Address</span>
                  <span className="flex items-center gap-2 font-mono text-[15px] text-ink-soft">
                    {shortAddress(user.pubkey)}
                    <Copy className="h-4 w-4 text-moss" strokeWidth={2.25} aria-label="Copy" />
                  </span>
                </button>
              </li>
              <li>
                <a
                  href={explorerAddress(user.pubkey)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-[44px] items-center justify-between gap-4 px-4 py-2.5 text-[17px] text-moss transition-colors active:bg-paper-sunk"
                >
                  View on explorer
                  <span aria-hidden>↗</span>
                </a>
              </li>
            </ul>

            <SectionHeader id="recent-heading">Recent</SectionHeader>
            {mine.isPending && <SkeletonRows count={3} label="Loading recent activity" />}
            {mine.error && <Notice tone="error">{errorMessage(mine.error)}</Notice>}
            {mine.data && entries.length === 0 && (
              <p className="px-8 text-[15px] text-ink-soft">Nothing yet. Posting or taking a quest shows up here.</p>
            )}
            {entries.length > 0 && (
              <ul className={groupedList} aria-labelledby="recent-heading">
                {entries.map((e) => {
                  const t = tokenForMint(e.mint)
                  return (
                    <li key={e.key}>
                      <Link
                        href={`/q/${e.questId}`}
                        className="flex items-center gap-3 py-3 pl-4 pr-2 transition-colors active:bg-paper-sunk"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[17px]">{e.label}</p>
                          <p className="mt-0.5 truncate text-[13px] text-ink-soft">
                            {timeAgo(e.at)} · {e.detail}
                          </p>
                        </div>
                        <span
                          className={`tabular shrink-0 text-[15px] font-semibold ${e.units > 0 ? 'text-moss' : 'text-ink'}`}
                        >
                          {e.units > 0 ? '+' : '−'}
                          {formatUnits(Math.abs(e.units), t.decimals)} {t.symbol}
                        </span>
                        <ChevronRight className="h-5 w-5 shrink-0 text-ink/25" strokeWidth={2.5} aria-hidden />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
            <p className="px-8 pt-2 text-[13px] leading-relaxed text-ink-soft">
              Lists Quest activity only. Transfers made outside Quest show up on the explorer.
            </p>
          </>
        )}
      </main>
    </div>
  )
}
