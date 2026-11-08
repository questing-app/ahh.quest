import type { Person } from '@/lib/types'
import { displayName } from '@/lib/types'

export function Avatar({ person, size = 32 }: { person: Person | null | undefined; size?: number }) {
  if (person?.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- user-supplied URLs from any host
      <img
        src={person.avatarUrl}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-moss-pale font-display text-moss"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {displayName(person).charAt(0).toUpperCase()}
    </span>
  )
}
