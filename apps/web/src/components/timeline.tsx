import { Check, X } from 'lucide-react'
import type { Quest, QuestClaim } from '@/lib/types'

type Stop = { label: string; state: 'done' | 'now' | 'later' | 'failed' }

/** Where a quest is: Posted → Taken → Video → Paid. Same four stops for everyone. */
export function questStops(quest: Quest, claims: QuestClaim[]): Stop[] {
  const latest = claims[0]
  const taken = latest && latest.status !== 'abandoned' && latest.status !== 'expired' ? latest : undefined

  if (quest.status === 'cancelled' || quest.status === 'expired') {
    return [
      { label: 'Posted', state: 'done' },
      { label: quest.status === 'cancelled' ? 'Cancelled' : 'Expired', state: 'failed' },
    ]
  }
  if (quest.status === 'completed' || taken?.status === 'approved') {
    return ['Posted', 'Taken', 'Video', 'Paid'].map((label) => ({ label, state: 'done' as const }))
  }
  if (quest.status === 'failed' || taken?.status === 'rejected') {
    return [
      { label: 'Posted', state: 'done' },
      { label: 'Taken', state: 'done' },
      { label: 'Video', state: 'done' },
      { label: 'Not approved', state: 'failed' },
    ]
  }
  if (taken?.status === 'submitted') {
    return [
      { label: 'Posted', state: 'done' },
      { label: 'Taken', state: 'done' },
      { label: 'Video', state: 'done' },
      { label: 'Paid', state: 'now' },
    ]
  }
  if (taken?.status === 'active') {
    return [
      { label: 'Posted', state: 'done' },
      { label: 'Taken', state: 'done' },
      { label: 'Video', state: 'now' },
      { label: 'Paid', state: 'later' },
    ]
  }
  return [
    { label: 'Posted', state: 'done' },
    { label: 'Taken', state: 'now' },
    { label: 'Video', state: 'later' },
    { label: 'Paid', state: 'later' },
  ]
}

export function Timeline({ stops }: { stops: Stop[] }) {
  return (
    <ol className="grid" style={{ gridTemplateColumns: `repeat(${stops.length}, minmax(0, 1fr))` }} aria-label="Progress">
      {stops.map((stop, i) => (
        <li key={stop.label} className="relative flex flex-col items-center">
          {i > 0 && (
            <span
              aria-hidden
              className={`absolute left-[calc(-50%+13px)] right-[calc(50%+13px)] top-[8px] h-[2px] rounded-full ${
                stop.state === 'later' ? 'bg-ink/15' : stop.state === 'failed' ? 'bg-wax' : 'bg-moss'
              }`}
            />
          )}
          <span
            className={`relative flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 ${
              stop.state === 'done'
                ? 'border-moss bg-moss text-paper-raised'
                : stop.state === 'failed'
                  ? 'border-wax bg-wax text-paper-raised'
                  : stop.state === 'now'
                    ? 'border-moss bg-paper-raised shadow-[0_0_0_4px_#E4E8D2]'
                    : 'border-ink/20 bg-paper-raised'
            }`}
          >
            {stop.state === 'done' && <Check className="h-2.5 w-2.5" strokeWidth={4} aria-hidden />}
            {stop.state === 'failed' && <X className="h-2.5 w-2.5" strokeWidth={4} aria-hidden />}
          </span>
          <span
            className={`mt-1.5 text-center text-[12px] leading-tight ${
              stop.state === 'later'
                ? 'text-ink-soft'
                : stop.state === 'failed'
                  ? 'font-semibold text-wax'
                  : 'font-semibold text-moss-deep'
            }`}
          >
            {stop.label}
            <span className="sr-only">
              {stop.state === 'done' ? ', done' : stop.state === 'now' ? ', happening now' : stop.state === 'later' ? ', not yet' : ''}
            </span>
          </span>
        </li>
      ))}
    </ol>
  )
}
