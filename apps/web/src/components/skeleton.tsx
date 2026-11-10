import { groupedList } from './notice'

const bar = 'rounded-full bg-ink/[0.08] motion-safe:animate-pulse'

/** Placeholder rows shaped like the list that's loading. */
export function SkeletonRows({ count = 4, label = 'Loading' }: { count?: number; label?: string }) {
  return (
    <ul className={groupedList} aria-busy="true" aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex items-center gap-3 py-4 pl-4 pr-4">
          <div className="min-w-0 flex-1 space-y-2">
            <div className={`${bar} h-3.5`} style={{ width: `${88 - ((i * 17) % 30)}%` }} />
            <div className={`${bar} h-3 w-2/5`} />
          </div>
          <div className={`${bar} h-6 w-10`} />
        </li>
      ))}
    </ul>
  )
}

/** Placeholder cards shaped like the quest board. */
export function SkeletonCards({ count = 3, label = 'Loading' }: { count?: number; label?: string }) {
  return (
    <ul className="mx-4 space-y-3" aria-busy="true" aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="rounded-[16px] bg-paper-raised p-4">
          <div className="flex items-center justify-between">
            <div className={`${bar} h-6 w-24`} />
            <div className={`${bar} h-5 w-14`} />
          </div>
          <div className={`${bar} mt-4 h-3.5`} style={{ width: `${90 - ((i * 17) % 30)}%` }} />
          <div className={`${bar} mt-2 h-3.5 w-3/5`} />
          <div className="mt-4 flex items-center gap-2">
            <div className={`${bar} h-[22px] w-[22px]`} />
            <div className={`${bar} h-3 w-28`} />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Placeholder for a whole quest page. */
export function SkeletonQuest() {
  return (
    <div aria-busy="true" aria-label="Loading quest" className="px-4 pt-2">
      <div className={`${bar} h-3 w-28`} />
      <div className={`${bar} mt-4 h-7 w-full`} />
      <div className={`${bar} mt-2.5 h-7 w-3/4`} />
      <div className="mt-5 flex items-center gap-2.5">
        <div className={`${bar} h-7 w-7`} />
        <div className={`${bar} h-3.5 w-32`} />
      </div>
      <div className="mt-6 h-[220px] rounded-[16px] bg-paper-raised" />
    </div>
  )
}
