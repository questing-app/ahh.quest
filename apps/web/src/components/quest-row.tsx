'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Quest } from '@/lib/types'
import { displayName } from '@/lib/types'
import { formatUnits, shortAddress, tokenForMint } from '@/lib/tokens'
import { deadlinePill, roughLeft, timeAgo } from '@/lib/time'
import { Avatar } from './avatar'

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

/** Spacing for a column of quest cards. */
export const questList = 'mx-4 space-y-3'

const pill = 'shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold leading-none'

/** Wraps the part of `text` that matches the search in a highlight. */
function Marked({ text, match }: { text: string; match?: string }) {
  const at = match ? text.toLowerCase().indexOf(match.toLowerCase()) : -1
  if (!match || at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-[3px] bg-[#F3E3C4] text-inherit">{text.slice(at, at + match.length)}</mark>
      {text.slice(at + match.length)}
    </>
  )
}

export function QuestRow({
  quest,
  showCreator = true,
  viewer,
  match,
}: {
  quest: Quest
  showCreator?: boolean
  /** Signed-in wallet, so quests posted for them stand out. */
  viewer?: string
  /** Search text to highlight in the dare. */
  match?: string
}) {
  const token = tokenForMint(quest.rewardMint)
  const open = quest.status === 'active'
  const forYou = open && quest.questType === 'direct' && !!viewer && quest.targetPubkey === viewer
  const time = deadlinePill(quest.deadline)
  const left = quest.deadline ? roughLeft(quest.deadline) : null
  const [artFailed, setArtFailed] = useState(false)
  const art = artFailed ? null : quest.imageUrl
  const surface = forYou ? 'bg-moss-pale' : 'bg-paper-raised'

  const reward = (
    <p className="leading-none">
      <span className="tabular font-display text-[26px] text-moss">{formatUnits(quest.rewardAmount, token.decimals)}</span>{' '}
      <span className="text-[12px] font-semibold tracking-wide text-ink-soft">{token.symbol}</span>
    </p>
  )
  // Over a picture the pill needs its own solid ground.
  const status = forYou ? (
    <span className={`${pill} bg-moss text-paper-raised`}>For you</span>
  ) : open ? (
    <span className={`${pill} ${time.soon ? 'bg-[#F3E3C4] text-[#6E4310]' : art ? 'bg-paper-raised text-ink' : 'bg-ink/[0.06] text-ink-soft'}`}>
      {time.label}
    </span>
  ) : (
    <span className={`${pill} ${art ? 'bg-paper-raised text-ink' : 'bg-ink/[0.06] text-ink-soft'}`}>{questAvailability(quest)}</span>
  )

  // The reward leads: it's what people scan the list for.
  return (
    <li>
      <Link
        href={`/q/${quest.id}`}
        className={`press-scale block overflow-hidden rounded-[16px] ${surface} ${forYou ? 'ring-1 ring-inset ring-moss/25' : ''}`}
      >
        {art ? (
          <div className="relative aspect-[3/2] bg-paper-sunk">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={art}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setArtFailed(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute right-3 top-3 flex">{status}</div>
            {/* The reward sits on a tab of the card that rises into the picture. */}
            <div className={`absolute bottom-0 left-0 rounded-tr-[14px] ${surface} pb-0.5 pl-4 pr-3.5 pt-2.5`}>{reward}</div>
          </div>
        ) : null}
        <div className={art ? 'px-4 pb-4 pt-2' : 'p-4'}>
          {art ? null : (
            <div className="flex items-center justify-between gap-3">
              {reward}
              {status}
            </div>
          )}
          <p className={`${art ? '' : 'mt-2.5 '}line-clamp-2 text-[17px] leading-snug`}>
            <Marked text={quest.description} match={match} />
          </p>
          {showCreator ? (
            <p className="mt-3 flex items-center gap-2 text-[13px] text-ink-soft">
              <Avatar person={quest.creator} size={22} />
              <span className="min-w-0 truncate">
                {forYou
                  ? `${displayName(quest.creator)} dared you · ${left ? `${left} left` : 'no time limit'}`
                  : `${displayName(quest.creator)} · posted ${timeAgo(quest.createdAt)}`}
              </span>
            </p>
          ) : (
            <p className="mt-2 text-[13px] text-ink-soft">Posted {timeAgo(quest.createdAt)}</p>
          )}
        </div>
      </Link>
    </li>
  )
}
