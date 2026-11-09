import Link from 'next/link'
import type { QuestClaim } from '@/lib/types'
import { displayName } from '@/lib/types'
import { claimStatusLine } from '@/lib/claim-status'
import { Avatar } from './avatar'
import { button } from './button'
import { SectionHeader, groupedList } from './notice'

/** Everyone who has taken this quest. Deciding happens on the review screen. */
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
    <section aria-labelledby="attempts-heading">
      <SectionHeader id="attempts-heading">Attempts</SectionHeader>
      <ul className={groupedList}>
        {claims.map((claim) => (
          <Attempt
            key={claim.id}
            questId={questId}
            claim={claim}
            canReview={viewerIsCreator && claim.status === 'submitted' && claim.proof?.aiDecision != null}
          />
        ))}
      </ul>
    </section>
  )
}

function Attempt({ questId, claim, canReview }: { questId: string; claim: QuestClaim; canReview: boolean }) {
  const proof = claim.proof
  const reason = proof?.rejectReason ?? (proof?.decidedBy === 'ai' && claim.status === 'rejected' ? proof.aiReasoning : null)

  return (
    <li className="p-4">
      <div className="flex items-center gap-3">
        <Avatar person={claim.claimer} size={30} />
        <p className="text-[15px]">
          <span className="font-semibold">{displayName(claim.claimer)}</span>
          <span className="text-ink-soft"> · {claimStatusLine(claim)}</span>
        </p>
      </div>

      {canReview ? (
        <Link href={`/q/${questId}/review`} className={`${button()} mt-4 w-full`}>
          Review the video
        </Link>
      ) : (
        proof &&
        claim.status !== 'submitted' && (
          <div className="mt-4 space-y-3">
            <video
              src={proof.videoUrl}
              poster={proof.thumbnailUrl ?? undefined}
              controls
              playsInline
              preload="metadata"
              className="aspect-[9/16] w-full rounded-[12px] bg-night object-cover"
            />
            {reason && (
              <p className="text-[15px] leading-relaxed text-ink-soft">
                <span className="font-semibold text-ink">Why it wasn’t approved: </span>
                {reason}
              </p>
            )}
          </div>
        )
      )}
    </li>
  )
}
