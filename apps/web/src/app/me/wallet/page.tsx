'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { NavBar } from '@/components/nav-bar'
import { TAB_BAR_SPACE } from '@/components/tab-bar'
import { Notice, SectionHeader, groupedList } from '@/components/notice'
import { SkeletonRows } from '@/components/skeleton'
import { useSolBalance, useTokenBalance } from '@/components/token-balance'
import { Sheet } from '@/components/sheet'
import { button } from '@/components/button'
import { toast } from '@/components/toast'
import { useMe, useMyFeed } from '@/lib/queries'
import { useApi, useSession } from '@/lib/session'
import { CLUSTER, explorerAddress } from '@/lib/chain'
import { TOKENS, feeFor, formatUnits, tokenForMint } from '@/lib/tokens'
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
      label: 'Posted a quest',
      detail: `${q.description} · locked`,
      units: -q.rewardAmount,
      mint: q.rewardMint,
      at: q.createdAt,
    })
    if (q.status === 'cancelled' || q.status === 'expired' || q.status === 'failed') {
      out.push({
        key: `back-${q.id}`,
        questId: q.id,
        label: 'Got back',
        detail: `${q.status === 'cancelled' ? 'Cancelled' : q.status === 'expired' ? 'Nobody took it' : 'Video rejected'}: ${q.description}`,
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
      label: lost ? 'Deposit lost' : 'Deposit',
      detail,
      units: -c.stakeAmount,
      mint,
      at: c.claimedAt,
    })
    if (c.status === 'approved' && c.quest) {
      out.push({
        key: `paid-${c.id}`,
        questId: c.questId,
        label: 'Quest paid',
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
      label: 'Kept their deposit',
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
  const api = useApi()
  const queryClient = useQueryClient()
  const me = useMe()
  const mine = useMyFeed()
  const balance = useTokenBalance()
  const sol = useSolBalance()
  const token = TOKENS[0]
  const entries = useMemo(() => (mine.data ? entriesFrom(mine.data) : []), [mine.data])
  const [receiving, setReceiving] = useState(false)

  // On devnet, adding funds is the faucet.
  const faucet = useMutation({
    mutationFn: () => api('/api/dev/faucet', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['balance'] })
      toast('Test QUEST and fee money added')
    },
    onError: (err) => toast(errorMessage(err)),
  })

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
            <section className="px-4 pb-1 pt-3 text-center">
              <p className="tabular font-display text-[44px] leading-none text-moss">
                {balance.data === undefined ? '…' : formatUnits(balance.data, token.decimals)}
              </p>
              <p className="mt-1.5 text-[15px] font-semibold text-moss">
                {token.symbol}
                {CLUSTER === 'devnet' && <span className="font-normal text-ink-soft"> · test tokens</span>}
              </p>
              <p className="tabular mt-1.5 text-[14px] text-ink-soft">
                {sol.data === undefined ? '…' : formatSol(sol.data)} SOL for network fees
              </p>
            </section>

            <div className="mx-4 mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => (CLUSTER === 'devnet' ? faucet.mutate() : setReceiving(true))}
                disabled={faucet.isPending}
                className={`${button()} flex-1`}
              >
                {faucet.isPending ? 'Adding…' : 'Add funds'}
              </button>
              <button type="button" onClick={copyAddress} className={`${button('outline')} flex-1`}>
                Copy address
              </button>
            </div>

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
                        className="flex items-center gap-3 px-4 py-3 transition-colors active:bg-paper-sunk"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[16px] leading-snug">{e.label}</p>
                          <p className="mt-0.5 truncate text-[13px] text-ink-soft">{e.detail}</p>
                        </div>
                        <span
                          className={`tabular shrink-0 text-[16px] font-semibold ${e.units > 0 ? 'text-moss' : 'text-ink'}`}
                        >
                          {e.units > 0 ? '+' : '−'}
                          {formatUnits(Math.abs(e.units), t.decimals)}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}

            <p className="pt-4 text-center">
              <a
                href={explorerAddress(user.pubkey)}
                target="_blank"
                rel="noreferrer"
                className="press inline-flex min-h-[44px] items-center text-[15px] text-moss"
              >
                View on Solana Explorer ↗
              </a>
            </p>
            <p className="px-8 text-center text-[13px] leading-relaxed text-ink-soft">
              Recent lists Quest activity only. Everything else is on the explorer.
            </p>

            <Sheet open={receiving} onClose={() => setReceiving(false)} label="Add funds">
              <h2 className="text-center font-display text-[24px] leading-tight">Add funds</h2>
              <p className="mt-2 text-center text-[15px] leading-relaxed text-ink-soft">
                Send {token.symbol} to this address from any Solana wallet or exchange. Add a little SOL too. It
                pays the network fees.
              </p>
              <p className="mt-4 break-all rounded-[12px] bg-paper-sunk px-4 py-3 text-center font-mono text-[14px] leading-relaxed">
                {user.pubkey}
              </p>
              <button type="button" onClick={copyAddress} className={`${button()} mt-4 w-full`}>
                Copy address
              </button>
              <button
                type="button"
                onClick={() => setReceiving(false)}
                className="press mt-1 h-11 w-full text-center text-[17px] text-moss"
              >
                Done
              </button>
            </Sheet>
          </>
        )}
      </main>
    </div>
  )
}

/** Lamports as SOL, to two places, without rounding a small balance up to look usable. */
function formatSol(lamports: number): string {
  return (Math.floor(lamports / 1e7) / 100).toFixed(2)
}
