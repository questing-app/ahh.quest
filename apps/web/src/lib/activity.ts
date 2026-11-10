import type { IncomingClaim, MyClaim, MyFeed, Quest } from './types'
import { displayName } from './types'
import { roughLeft, shortDate } from './time'
import { feeFor, formatAmount } from './tokens'

export type ActivityItem = {
  key: string
  href: string
  /** The next step or the outcome, in words: “Send your video”, “Paid 51.25 QUEST”. */
  title: string
  /** The dare this row is about. */
  dare: string
  /** What follows the dare on the second line: time left, or the date it ended. */
  detail: string
  /** True when the detail is a deadline worth drawing the eye to. */
  urgent?: boolean
  kind: 'review' | 'film' | 'waiting' | 'checking' | 'paid' | 'ended'
  sortAt: number
}

export type Activity = { needsYou: ActivityItem[]; inProgress: ActivityItem[]; done: ActivityItem[] }

type Placed = { group: keyof Activity; item: ActivityItem }

function fromMyClaim(claim: MyClaim): Placed {
  const quest = claim.quest
  const base = {
    key: `claim-${claim.id}`,
    href: `/q/${claim.questId}`,
    dare: quest?.description ?? 'Quest',
    sortAt: claim.claimedAt,
  }
  const ended = shortDate(claim.settledAt ?? claim.claimedAt)
  switch (claim.status) {
    case 'active': {
      const left = roughLeft(claim.proofDeadline)
      if (!left) {
        return { group: 'inProgress', item: { ...base, kind: 'ended', title: 'Out of time', detail: 'the video wasn’t sent' } }
      }
      return {
        group: 'needsYou',
        item: { ...base, kind: 'film', title: 'Send your video', detail: `${left} left`, urgent: true },
      }
    }
    case 'submitted': {
      const left = claim.reviewDeadline ? roughLeft(claim.reviewDeadline) : null
      return {
        group: 'inProgress',
        item: { ...base, kind: 'checking', title: 'Being checked', detail: left ? `answer within ${left}` : 'video sent' },
      }
    }
    case 'approved': {
      // The winner gets the reward less the fee, plus their deposit back.
      const paid = quest
        ? formatAmount(quest.rewardAmount - feeFor(quest.rewardAmount) + claim.stakeAmount, quest.rewardMint)
        : null
      return { group: 'done', item: { ...base, kind: 'paid', title: paid ? `Paid ${paid}` : 'Paid', detail: ended } }
    }
    case 'rejected':
      return { group: 'done', item: { ...base, kind: 'ended', title: 'Video not approved', detail: ended } }
    case 'abandoned':
      return { group: 'done', item: { ...base, kind: 'ended', title: 'You gave up', detail: ended } }
    case 'expired':
      return { group: 'done', item: { ...base, kind: 'ended', title: 'Ran out of time', detail: ended } }
  }
}

function openFor(deadline: number | null): string {
  if (!deadline) return 'no time limit'
  const left = roughLeft(deadline)
  if (!left) return 'closing'
  return left.endsWith('days') ? `open ${left.replace(' days', ' more days')}` : `closes in ${left}`
}

function fromMyQuest(quest: Quest, incoming: IncomingClaim | undefined): Placed {
  const base = { key: `quest-${quest.id}`, href: `/q/${quest.id}`, dare: quest.description, sortAt: quest.createdAt }
  if (incoming) {
    const who = displayName(incoming.claimer)
    if (incoming.status === 'submitted' && incoming.checked) {
      const left = incoming.reviewDeadline ? roughLeft(incoming.reviewDeadline) : null
      return {
        group: 'needsYou',
        item: {
          ...base,
          href: `/q/${quest.id}/review`,
          sortAt: incoming.claimedAt,
          kind: 'review',
          title: `Review ${who}’s video`,
          detail: left ? `approves itself in ${left}` : 'waiting on you',
        },
      }
    }
    if (incoming.status === 'submitted') {
      return { group: 'inProgress', item: { ...base, kind: 'checking', title: 'Being checked', detail: `${who} sent a video` } }
    }
    const left = roughLeft(incoming.proofDeadline)
    return {
      group: 'inProgress',
      item: { ...base, kind: 'waiting', title: `${who} is on it`, detail: left ? `video due in ${left}` : 'out of time' },
    }
  }
  const ended = shortDate(quest.closedAt ?? quest.createdAt)
  switch (quest.status) {
    case 'active':
    case 'claimed':
      return { group: 'inProgress', item: { ...base, kind: 'waiting', title: 'Waiting for a taker', detail: openFor(quest.deadline) } }
    case 'completed':
      return {
        group: 'done',
        item: { ...base, kind: 'paid', title: `Paid out ${formatAmount(quest.rewardAmount, quest.rewardMint)}`, detail: ended },
      }
    case 'failed':
      return { group: 'done', item: { ...base, kind: 'ended', title: 'Video rejected, reward returned', detail: ended } }
    case 'cancelled':
      return { group: 'done', item: { ...base, kind: 'ended', title: 'Cancelled', detail: ended } }
    case 'expired':
      return { group: 'done', item: { ...base, kind: 'ended', title: 'Nobody took it', detail: ended } }
  }
}

export function buildActivity(feed: MyFeed): Activity {
  const activity: Activity = { needsYou: [], inProgress: [], done: [] }
  const incomingByQuest = new Map((feed.incoming ?? []).map((c) => [c.questId, c]))
  for (const quest of feed.quests) {
    const { group, item } = fromMyQuest(quest, incomingByQuest.get(quest.id))
    activity[group].push(item)
  }
  for (const claim of feed.claims) {
    const { group, item } = fromMyClaim(claim)
    activity[group].push(item)
  }
  for (const list of Object.values(activity)) list.sort((a, b) => b.sortAt - a.sortAt)
  return activity
}
