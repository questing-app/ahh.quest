import type { QuestClaim } from './types'
import { remaining } from './time'

export function claimStatusLine(claim: QuestClaim): string {
  switch (claim.status) {
    case 'active': {
      const left = remaining(claim.proofDeadline)
      return left ? `Filming now · proof due in ${left}` : 'Proof is overdue'
    }
    case 'submitted': {
      if (!claim.proof || claim.proof.aiDecision === null) return 'Video sent, being checked'
      const left = claim.reviewDeadline ? remaining(claim.reviewDeadline) : null
      return left ? `Waiting on the poster · approves itself in ${left}` : 'Waiting on the poster'
    }
    case 'approved':
      return 'Approved and paid'
    case 'rejected':
      return 'Not approved'
    case 'abandoned':
      return 'Gave up'
    case 'expired':
      return 'Ran out of time'
  }
}
