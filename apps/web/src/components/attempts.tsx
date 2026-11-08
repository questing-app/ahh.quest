'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { QuestClaim } from '@/lib/types'
import { displayName } from '@/lib/types'
import { claimStatusLine } from '@/lib/claim-status'
import { useApi } from '@/lib/session'
import { errorMessage } from '@/lib/api'
import { Avatar } from './avatar'
import { button } from './button'
import { ConfirmButton } from './confirm-button'

export function Attempts({
  questId,
  claims,
  viewerIsCreator,
}: {
  questId: string
  claims: QuestClaim[]
  viewerIsCreator: boolean
}) {
  if (claims.length === 0) return null

  return (
    <section className="mt-12" aria-labelledby="attempts-heading">
      <h2 id="attempts-heading" className="font-display text-[26px] leading-none">
        Attempts
      </h2>
      <ul className="mt-5 divide-y divide-rule border-y border-rule">
        {claims.map((claim) => (
          <Attempt key={claim.id} questId={questId} claim={claim} canDecide={viewerIsCreator && claim.status === 'submitted'} />
        ))}
      </ul>
    </section>
  )
}

function Attempt({ questId, claim, canDecide }: { questId: string; claim: QuestClaim; canDecide: boolean }) {
  const api = useApi()
  const queryClient = useQueryClient()
  const decide = useMutation({
    mutationFn: (verdict: 'approve' | 'reject') =>
      api(`/api/claims/${claim.id}/${verdict}`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quest', questId] })
      queryClient.invalidateQueries({ queryKey: ['mine'] })
    },
  })

  const proof = claim.proof

  return (
    <li className="py-6">
      <div className="flex items-center gap-3">
        <Avatar person={claim.claimer} size={30} />
        <p className="text-[15px]">
          <span className="font-semibold">{displayName(claim.claimer)}</span>
          <span className="text-ink-soft"> · {claimStatusLine(claim)}</span>
        </p>
      </div>

      {proof && (
        <div className="mt-4 grid gap-5 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
          <video
            src={proof.videoUrl}
            poster={proof.thumbnailUrl ?? undefined}
            controls
            playsInline
            preload="metadata"
            className="aspect-[9/16] w-full max-w-[240px] rounded-md bg-night object-cover"
          />
          <div className="text-[15px] leading-relaxed">
            {proof.aiConfidence !== null ? (
              <>
                <p className="font-semibold">Video check: {proof.aiConfidence}% sure it’s done</p>
                {proof.aiReasoning && <p className="mt-1 text-ink-soft">{proof.aiReasoning}</p>}
              </>
            ) : (
              <p className="text-ink-soft">The video is still being checked. This usually takes a minute or two.</p>
            )}

            {canDecide && (
              <div className="mt-5 space-y-3">
                <p className="text-sm text-ink-soft">
                  It’s your call. If you don’t decide before the timer runs out, it’s approved automatically.
                </p>
                <div className="flex flex-wrap items-start gap-3">
                  <button
                    type="button"
                    onClick={() => decide.mutate('approve')}
                    disabled={decide.isPending}
                    className={button('primary', 'sm')}
                  >
                    Approve and pay
                  </button>
                  <ConfirmButton
                    label="Reject"
                    question="Reject this video? The reward and their deposit come back to you."
                    confirmLabel="Reject video"
                    pending={decide.isPending}
                    onConfirm={() => decide.mutate('reject')}
                  />
                </div>
                {decide.error && <p className="text-sm text-wax">{errorMessage(decide.error)}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </li>
  )
}
