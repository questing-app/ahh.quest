// Response shapes from apps/api. Timestamps are unix seconds, amounts are
// integer base units of the reward mint.

export type QuestStatus = 'active' | 'claimed' | 'completed' | 'failed' | 'cancelled' | 'expired'
export type ClaimStatus = 'active' | 'submitted' | 'approved' | 'rejected' | 'abandoned' | 'expired'

export interface Person {
  id: string
  username: string
  pubkey: string
  avatarUrl: string | null
}

export interface User extends Person {
  questsCompleted: number
  questsPosted: number
  activeClaims: number
  createdAt: number
}

export interface Quest {
  id: string
  onchainId: string
  txSignature: string | null
  escrowPda: string
  creatorId: string
  creator: Person | null
  description: string
  questType: 'direct' | 'open'
  status: QuestStatus
  rewardAmount: number
  rewardMint: string
  targetPubkey: string | null
  maxClaimers: number
  currentClaimers: number
  deadline: number | null
  createdAt: number
}

export interface Claim {
  id: string
  questId: string
  claimerId: string
  status: ClaimStatus
  stakeAmount: number
  proofDeadline: number
  reviewDeadline: number | null
  claimedAt: number
}

export interface Proof {
  id: string
  videoUrl: string
  thumbnailUrl: string | null
  durationSeconds: number
  aiConfidence: number | null
  aiDecision: 'APPROVE' | 'REJECT' | 'UNCERTAIN' | null
  aiReasoning: string | null
  finalDecision: 'approved' | 'rejected' | null
  decidedBy: 'ai' | 'creator' | 'timeout' | null
  createdAt: number
}

export interface QuestClaim extends Claim {
  claimer: Person | null
  proof: Proof | null
}

export interface MyClaim extends Claim {
  quest: Quest | null
}

export interface MyFeed {
  quests: Quest[]
  claims: MyClaim[]
}

/** New accounts get "<first 8 of pubkey>..." until they pick a name. */
export const hasDefaultName = (user: Pick<Person, 'username'>) => user.username.endsWith('...')

export function displayName(person: Pick<Person, 'username' | 'pubkey'> | null | undefined): string {
  if (!person) return 'someone'
  return hasDefaultName(person) ? `${person.pubkey.slice(0, 4)}…${person.pubkey.slice(-4)}` : person.username
}
