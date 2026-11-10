'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { NavBar } from '@/components/nav-bar'
import { TAB_BAR_SPACE } from '@/components/tab-bar'
import { Avatar } from '@/components/avatar'
import { SkeletonQuest } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { Sheet } from '@/components/sheet'
import { button } from '@/components/button'
import { toast } from '@/components/toast'
import { useMe, useQuest, useQuestClaims } from '@/lib/queries'
import { useApi } from '@/lib/session'
import { displayName } from '@/lib/types'
import { formatUnits, tokenForMint } from '@/lib/tokens'
import { formatClock, roughLeft, timeAgo } from '@/lib/time'
import { errorMessage } from '@/lib/api'

const MAX_REASON = 280

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const api = useApi()
  const queryClient = useQueryClient()
  const quest = useQuest(id)
  const claims = useQuestClaims(id)
  const { data: me } = useMe()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  const claim = claims.data?.find((c) => c.status === 'submitted')
  const decide = useMutation({
    mutationFn: (verdict: 'approve' | 'reject') =>
      api(`/api/claims/${claim!.id}/${verdict}`, {
        method: 'POST',
        ...(verdict === 'reject' ? { json: { reason: reason.trim() || undefined } } : {}),
      }),
    onSuccess: (_, verdict) => {
      queryClient.invalidateQueries({ queryKey: ['quest', id] })
      queryClient.invalidateQueries({ queryKey: ['mine'] })
      queryClient.invalidateQueries({ queryKey: ['balance'] })
      setRejecting(false)
      toast(verdict === 'approve' ? `Approved. ${displayName(claim?.claimer)} has been paid.` : 'Rejected. The reward is back with you.')
      router.replace(`/q/${id}`)
    },
  })

  const back = <NavBar title="Review" back="Activity" backHref="/activity" />

  if (quest.isPending || claims.isPending || !me) {
    return (
      <div className={TAB_BAR_SPACE}>
        {back}
        <SkeletonQuest />
      </div>
    )
  }

  if (!quest.data || quest.data.creatorId !== me.id || !claim?.proof) {
    return (
      <div className={TAB_BAR_SPACE}>
        {back}
        <EmptyState
          art="/art/empty.jpg"
          title="Nothing to review"
          body={
            quest.data && quest.data.creatorId !== me.id
              ? 'Only the person who posted this quest can review its videos.'
              : 'There’s no video waiting on this quest right now. Anything new shows up in Activity.'
          }
        >
          <Link href="/activity" className={`${button()} w-full`}>
            Go to Activity
          </Link>
        </EmptyState>
      </div>
    )
  }

  const q = quest.data
  const proof = claim.proof
  const token = tokenForMint(q.rewardMint)
  const amount = (units: number) => `${formatUnits(units, token.decimals)} ${token.symbol}`
  const who = displayName(claim.claimer)
  const left = claim.reviewDeadline ? roughLeft(claim.reviewDeadline) : null
  const verdictTone =
    proof.aiDecision === 'APPROVE' ? 'bg-moss-pale text-moss-deep' : proof.aiDecision === 'REJECT' ? 'bg-wax/10 text-wax' : 'bg-[#F3E3C4] text-[#6E4310]'
  const verdictLabel =
    proof.aiDecision === 'APPROVE' ? 'Looks done' : proof.aiDecision === 'REJECT' ? 'Looks short' : 'Not sure'

  return (
    <div className="pb-[calc(49px+env(safe-area-inset-bottom)+150px)]">
      {back}
      <main className="px-4">
        <h2 className="tabular pt-1 text-[20px] font-bold leading-tight">
          {who}’s video · {formatClock(proof.durationSeconds)}
        </h2>
        <p className="mt-1 line-clamp-2 text-[15px] leading-snug text-ink-soft">{q.description}</p>
        <video
          src={proof.videoUrl}
          poster={proof.thumbnailUrl ?? undefined}
          controls
          playsInline
          preload="metadata"
          className="mt-3 aspect-[9/16] max-h-[56dvh] w-full rounded-[16px] bg-night object-contain"
        />
        <div className="mt-3 flex items-center gap-2 text-[15px]">
          <Avatar person={claim.claimer} size={24} />
          <span className="font-semibold">{who}</span>
          <span className="text-ink-soft">· sent {timeAgo(proof.createdAt)}</span>
        </div>

        <section className="mt-4 rounded-[16px] bg-paper-raised px-4 py-3.5" aria-label="AI check">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[15px] font-semibold">AI check</p>
            {proof.aiConfidence !== null && (
              <span className={`tabular rounded-full px-2.5 py-1 text-[12px] font-semibold ${verdictTone}`}>
                {verdictLabel} · {proof.aiConfidence}%
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">
            {proof.aiReasoning ?? 'The check couldn’t decide, so it’s your call.'}
          </p>
        </section>

        {left && (
          <p className="mt-3 inline-block rounded-full bg-[#F3E3C4] px-3 py-1.5 text-[13px] font-semibold text-[#6E4310]">
            Approves itself in {left} if you don’t answer
          </p>
        )}
        {decide.error && !rejecting && (
          <p role="alert" className="mt-3 text-[15px] text-wax">
            {errorMessage(decide.error)}
          </p>
        )}
      </main>

      <div className="chrome fixed inset-x-0 bottom-[calc(49px+env(safe-area-inset-bottom))] z-30 border-t-[0.5px] border-ink/10 bg-paper/95 px-4 pb-3 pt-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[520px] flex-col gap-2">
          <button type="button" onClick={() => decide.mutate('approve')} disabled={decide.isPending} className={`${button()} w-full`}>
            {decide.isPending && decide.variables === 'approve' ? 'Paying…' : `Approve and pay ${amount(q.rewardAmount)}`}
          </button>
          <button type="button" onClick={() => setRejecting(true)} disabled={decide.isPending} className={`${button('outline')} w-full`}>
            Reject
          </button>
        </div>
      </div>

      <Sheet open={rejecting} onClose={() => !decide.isPending && setRejecting(false)} label={`Reject ${who}’s video`}>
        <h2 className="text-[22px] font-bold leading-tight">Reject {who}’s video?</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
          Your {amount(q.rewardAmount)} comes back to you and {who}’s {amount(claim.stakeAmount)} deposit goes to you.{' '}
          {who} sees the reason you give.
        </p>
        <label htmlFor="reject-reason" className="mt-4 block text-[13px] font-semibold uppercase tracking-wide text-ink-soft">
          What was missing?
        </label>
        <textarea
          id="reject-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, MAX_REASON))}
          rows={3}
          placeholder="For example: only 38 pushups on camera, and it stops at 1:30."
          className="mt-1.5 w-full resize-none rounded-[12px] border-[1.5px] border-ink/15 bg-paper px-4 py-3 text-[17px] leading-snug placeholder:text-ink-soft/60 focus:border-moss focus:outline-none"
        />
        <p className="tabular mt-1 text-right text-[12px] text-ink-soft">
          {reason.length}/{MAX_REASON}
        </p>
        {decide.error && (
          <p role="alert" className="mt-2 text-[15px] text-wax">
            {errorMessage(decide.error)}
          </p>
        )}
        <button
          type="button"
          onClick={() => decide.mutate('reject')}
          disabled={decide.isPending}
          className={`${button()} mt-3 w-full !bg-wax`}
        >
          {decide.isPending && decide.variables === 'reject' ? 'Rejecting…' : 'Reject video'}
        </button>
        <button
          type="button"
          onClick={() => setRejecting(false)}
          disabled={decide.isPending}
          className="press mt-1 h-11 w-full text-[17px] text-moss"
        >
          Keep reviewing
        </button>
      </Sheet>
    </div>
  )
}
