'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Quest, QuestClaim, User } from '@/lib/types'
import { feeFor, formatUnits, stakeFor, tokenForMint } from '@/lib/tokens'
import { remaining } from '@/lib/time'
import { abandonClaimIx, cancelQuestIx, claimQuestIx } from '@quest/sdk'
import { useApi, useSession } from '@/lib/session'
import { errorMessage } from '@/lib/api'
import { program, useSendTransaction, useWallet } from '@/lib/chain'
import { TokenBalance, useTokenBalance } from './token-balance'
import { button } from './button'
import { ConfirmButton } from './confirm-button'
import { toast } from './toast'

export function RewardPanel({
  quest,
  claims,
  me,
}: {
  quest: Quest
  claims: QuestClaim[]
  me: User | undefined
}) {
  const token = tokenForMint(quest.rewardMint)
  const amount = (units: number) => `${formatUnits(units, token.decimals)} ${token.symbol}`
  const fee = feeFor(quest.rewardAmount)
  const stake = stakeFor(quest.rewardAmount)

  return (
    <div className="mx-4 rounded-[16px] bg-paper-raised p-5">
      <p className="text-[13px] uppercase tracking-wide text-ink-soft">Reward</p>
      <p className="mt-1 leading-none">
        <span className="tabular font-display text-[46px] text-moss">
          {formatUnits(quest.rewardAmount, token.decimals)}
        </span>{' '}
        <span className="text-lg font-semibold">{token.symbol}</span>
      </p>

      <dl className="tabular mt-5 space-y-2.5 border-t-[0.5px] border-ink/15 pt-4 text-[15px]">
        <div className="flex justify-between gap-4">
          <dt className="text-ink-soft">Fee (2.5%)</dt>
          <dd>−{amount(fee)}</dd>
        </div>
        <div className="flex justify-between gap-4 font-semibold">
          <dt>Winner receives</dt>
          <dd>{amount(quest.rewardAmount - fee)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-soft">Deposit to take it</dt>
          <dd>{amount(stake)}</dd>
        </div>
      </dl>

      <div className="mt-5">
        <PanelAction quest={quest} claims={claims} me={me} stake={stake} stakeLabel={amount(stake)} />
      </div>
    </div>
  )
}

function PanelAction({
  quest,
  claims,
  me,
  stake,
  stakeLabel,
}: {
  quest: Quest
  claims: QuestClaim[]
  me: User | undefined
  stake: number
  stakeLabel: string
}) {
  const { ready, authenticated, login } = useSession()
  const api = useApi()
  const queryClient = useQueryClient()

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['quest', quest.id] })
    queryClient.invalidateQueries({ queryKey: ['mine'] })
    queryClient.invalidateQueries({ queryKey: ['feed'] })
    queryClient.invalidateQueries({ queryKey: ['me'] })
  }

  const sendTransaction = useSendTransaction()
  const { address } = useWallet()
  const balance = useTokenBalance()
  const onChain = { questId: quest.onchainId, mint: quest.rewardMint }

  // Each action is signed on-chain first; the API then mirrors what landed.
  const [claimStep, setClaimStep] = useState<'checking' | 'signing'>('checking')
  const claim = useMutation({
    mutationFn: async () => {
      setClaimStep('checking')
      await api(`/api/quests/${quest.id}/claim/check`, { method: 'POST' })
      setClaimStep('signing')
      const ix = await claimQuestIx(program, { ...onChain, claimer: address!, stakeAmount: stake })
      const txSignature = await sendTransaction([ix])
      return api(`/api/quests/${quest.id}/claim`, { json: { txSignature } })
    },
    onSuccess: () => {
      refresh()
      toast('Quest taken. The clock is running.')
    },
  })
  const cancel = useMutation({
    mutationFn: async () => {
      await sendTransaction([await cancelQuestIx(program, { ...onChain, creator: address! })])
      return api(`/api/quests/${quest.id}`, { method: 'DELETE' })
    },
    onSuccess: () => {
      refresh()
      toast('Quest cancelled. The reward is back in your wallet.')
    },
  })
  const abandon = useMutation({
    mutationFn: async (claimId: string) => {
      const creator = quest.creator?.pubkey
      if (!creator) throw new Error('Couldn’t find who posted this quest.')
      await sendTransaction([await abandonClaimIx(program, { ...onChain, claimer: address!, creator })])
      return api(`/api/claims/${claimId}`, { method: 'DELETE' })
    },
    onSuccess: () => {
      refresh()
      toast('You gave up this quest.')
    },
  })

  const error = claim.error ?? cancel.error ?? abandon.error
  const errorLine = error ? (
    <p role="alert" className="mt-3 text-[15px] text-wax">
      {errorMessage(error)}
    </p>
  ) : null

  if (!ready) return null

  if (!authenticated) {
    return quest.status === 'active' ? (
      <button type="button" onClick={login} className={`${button()} w-full`}>
        Sign in to take this quest
      </button>
    ) : null
  }

  if (!me || !address) return <p className="text-[15px] text-ink-soft">Loading your account…</p>

  // The poster
  if (quest.creatorId === me.id) {
    if (quest.status === 'active' && quest.currentClaimers === 0) {
      return (
        <>
          <p className="mb-4 text-[15px] text-ink-soft">Nobody has taken this yet, so you can still cancel it.</p>
          <ConfirmButton
            label="Cancel quest"
            question="Cancel this quest? The reward goes back to your wallet."
            confirmLabel="Cancel quest"
            pending={cancel.isPending}
            onConfirm={() => cancel.mutate()}
          />
          {errorLine}
        </>
      )
    }
    const waiting = claims.filter((c) => c.status === 'submitted').length
    return (
      <p className="text-[15px] text-ink-soft">
        {waiting > 0
          ? `${waiting === 1 ? 'A video is' : `${waiting} videos are`} waiting below.`
          : 'Nobody is on it right now. Attempts show up below.'}
      </p>
    )
  }

  // Someone with a live attempt
  const mine = claims.find((c) => c.claimerId === me.id && (c.status === 'active' || c.status === 'submitted'))
  if (mine?.status === 'active') {
    const left = remaining(mine.proofDeadline)
    return (
      <>
        <Link href={`/q/${quest.id}/record`} className={`${button()} w-full`}>
          Record your proof
        </Link>
        <p className="mt-3 text-[15px] text-ink-soft">
          {left ? `${left} left to send your video.` : 'Your time to send a video has run out.'}
        </p>
        <div className="mt-4">
          <ConfirmButton
            variant="link"
            label="Give up this quest"
            question={`Give up this quest? You lose your ${stakeLabel} deposit to the poster.`}
            confirmLabel="Give up"
            pending={abandon.isPending}
            onConfirm={() => abandon.mutate(mine.id)}
          />
        </div>
        {errorLine}
      </>
    )
  }
  if (mine?.status === 'submitted') {
    return <p className="text-[15px]">Your video is in. The result shows up here, usually within a few minutes.</p>
  }

  // Everyone else
  if (quest.status !== 'active') {
    return <p className="text-[15px] text-ink-soft">This quest isn’t taking new attempts.</p>
  }
  if (quest.questType === 'direct' && quest.targetPubkey !== me.pubkey) {
    return <p className="text-[15px] text-ink-soft">This quest was posted for someone else.</p>
  }

  const canAfford = balance.data === undefined || balance.data >= stake

  return (
    <>
      <button
        type="button"
        onClick={() => claim.mutate()}
        disabled={claim.isPending || !canAfford}
        className={`${button()} w-full`}
      >
        {claim.isPending ? (claimStep === 'checking' ? 'Checking…' : 'Confirm in your wallet…') : 'Take this quest'}
      </button>
      {!canAfford && (
        <div className="mt-3">
          <TokenBalance />
        </div>
      )}
      <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
        You put down {stakeLabel} and get it back with the reward. Then you have 24 hours to send your video.
      </p>
      {errorLine}
    </>
  )
}
