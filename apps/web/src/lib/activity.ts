import type { IncomingClaim, MyClaim, MyFeed, Quest } from './types'
import { displayName } from './types'
import { remaining } from './time'

export type ActivityItem = {
  key: string
  href: string
  quest: Quest | null
  title: string
  status: string
  /** Tone of the status line: something to do, waiting, or finished. */
  tone: 'act' | 'wait' | 'done' | 'bad'
  /** Button shown under the row for items that need the viewer. */
  action?: { label: string; href: string }
  sortAt: number
}

export type Activity = { needsYou: ActivityItem[]; inProgress: ActivityItem[]; done: ActivityItem[] }

function fromMyClaim(claim: MyClaim): { group: keyof Activity; item: ActivityItem } {
  const base = {
    key: `claim-${claim.id}`,
    href: `/q/${claim.questId}`,
    quest: claim.quest,
    title: claim.quest?.description ?? 'Quest',
    sortAt: claim.claimedAt,
  }
  switch (claim.status) {
    case 'active': {
      const left = remaining(claim.proofDeadline)
      if (!left) return { group: 'inProgress', item: { ...base, status: 'Time to send ran out', tone: 'bad' } }
      return {
        group: 'needsYou',
        item: {
          ...base,
          status: `Your video is due in ${left}`,
          tone: 'act',
          action: { label: 'Record your video', href: `/q/${claim.questId}/record` },
        },
      }
    }
    case 'submitted':
      return { group: 'inProgress', item: { ...base, status: 'Video sent · waiting on the result', tone: 'wait' } }
    case 'approved':
      return { group: 'done', item: { ...base, status: 'You got paid', tone: 'done' } }
    case 'rejected':
      return { group: 'done', item: { ...base, status: 'Your video wasn’t approved', tone: 'bad' } }
    case 'abandoned':
      return { group: 'done', item: { ...base, status: 'You gave up', tone: 'bad' } }
    case 'expired':
      return { group: 'done', item: { ...base, status: 'Ran out of time', tone: 'bad' } }
  }
}

function fromMyQuest(quest: Quest, incoming: IncomingClaim | undefined): { group: keyof Activity; item: ActivityItem } {
  const base = { key: `quest-${quest.id}`, href: `/q/${quest.id}`, quest, title: quest.description, sortAt: quest.createdAt }
  if (incoming) {
    const who = displayName(incoming.claimer)
    if (incoming.status === 'submitted' && incoming.checked) {
      const left = incoming.reviewDeadline ? remaining(incoming.reviewDeadline) : null
      return {
        group: 'needsYou',
        item: {
          ...base,
          sortAt: incoming.claimedAt,
          status: left ? `${who} sent a video · approves itself in ${left}` : `${who} sent a video`,
          tone: 'act',
          action: { label: 'Review the video', href: `/q/${quest.id}/review` },
        },
      }
    }
    if (incoming.status === 'submitted') {
      return { group: 'inProgress', item: { ...base, status: `${who} sent a video · being checked`, tone: 'wait' } }
    }
    const left = remaining(incoming.proofDeadline)
    return {
      group: 'inProgress',
      item: { ...base, status: left ? `${who} is on it · video due in ${left}` : `${who} ran out of time`, tone: 'wait' },
    }
  }
  switch (quest.status) {
    case 'active':
    case 'claimed': {
      const left = quest.deadline ? remaining(quest.deadline) : null
      return {
        group: 'inProgress',
        item: { ...base, status: left ? `Waiting for a taker · ${left} left` : 'Waiting for a taker', tone: 'wait' },
      }
    }
    case 'completed':
      return { group: 'done', item: { ...base, status: 'Done and paid out', tone: 'done' } }
    case 'failed':
      return { group: 'done', item: { ...base, status: 'Video not approved · reward back with you', tone: 'done' } }
    case 'cancelled':
      return { group: 'done', item: { ...base, status: 'You cancelled it', tone: 'done' } }
    case 'expired':
      return { group: 'done', item: { ...base, status: 'Nobody took it · reward back with you', tone: 'done' } }
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
