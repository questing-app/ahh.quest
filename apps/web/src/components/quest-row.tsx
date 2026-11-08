import Link from 'next/link'
import type { Quest } from '@/lib/types'
import { displayName } from '@/lib/types'
import { formatUnits, shortAddress, tokenForMint } from '@/lib/tokens'
import { timeLeft } from '@/lib/time'

export function questAvailability(quest: Quest): string {
  switch (quest.status) {
    case 'active': {
      if (quest.questType === 'direct' && quest.targetPubkey) return `For ${shortAddress(quest.targetPubkey)}`
      return 'Open to anyone'
    }
    case 'claimed':
      return 'Someone is on it'
    case 'completed':
      return 'Paid out'
    case 'failed':
      return 'Not approved'
    case 'cancelled':
      return 'Cancelled'
    case 'expired':
      return 'Expired'
  }
}

export function QuestRow({ quest, showCreator = true }: { quest: Quest; showCreator?: boolean }) {
  const token = tokenForMint(quest.rewardMint)
  const meta = [
    showCreator ? displayName(quest.creator) : null,
    questAvailability(quest),
    quest.status === 'active' && quest.deadline ? timeLeft(quest.deadline) : null,
  ].filter(Boolean)

  return (
    <li>
      <Link
        href={`/q/${quest.id}`}
        className="-mx-3 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-6 rounded-md px-3 py-5 hover:bg-paper-raised"
      >
        <div>
          <p className="text-[17px] font-medium leading-snug">{quest.description}</p>
          <p className="mt-1.5 text-sm text-ink-soft">{meta.join(' · ')}</p>
        </div>
        <p className="text-right leading-none">
          <span className="tabular font-display text-[28px] text-moss">
            {formatUnits(quest.rewardAmount, token.decimals)}
          </span>
          <span className="mt-1 block text-xs font-semibold tracking-wide text-ink-soft">{token.symbol}</span>
        </p>
      </Link>
    </li>
  )
}
