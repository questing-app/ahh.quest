import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
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

  // The reward leads: it's what people scan the list for.
  return (
    <li>
      <Link
        href={`/q/${quest.id}`}
        className="flex items-center gap-3 py-3.5 pl-4 pr-2 transition-colors active:bg-paper-sunk"
      >
        <div className="min-w-0 flex-1">
          <p className="leading-none">
            <span className="tabular font-display text-[22px] text-moss">{formatUnits(quest.rewardAmount, token.decimals)}</span>{' '}
            <span className="text-[12px] font-semibold tracking-wide text-ink-soft">{token.symbol}</span>
          </p>
          <p className="mt-1.5 line-clamp-2 text-[17px] leading-snug">{quest.description}</p>
          <p className="mt-1 truncate text-[13px] text-ink-soft">{meta.join(' · ')}</p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-ink/25" strokeWidth={2.5} aria-hidden />
      </Link>
    </li>
  )
}
