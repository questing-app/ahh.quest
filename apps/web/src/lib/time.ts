const nowSeconds = () => Math.floor(Date.now() / 1000)

function span(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${Math.max(minutes, 1)}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h ${minutes % 60}m`
  return `${Math.floor(hours / 24)} days`
}

/** "5h 12m left", or "Time's up" once the deadline passes. */
export function timeLeft(deadline: number): string {
  const remaining = deadline - nowSeconds()
  return remaining > 0 ? `${span(remaining)} left` : "Time's up"
}

export function timeAgo(timestamp: number): string {
  const elapsed = nowSeconds() - timestamp
  if (elapsed < 60) return 'just now'
  return `${span(elapsed).split(' ')[0]} ago`
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Remaining time as a bare span ("5h 12m"), or null once it has passed. */
export function remaining(deadline: number): string | null {
  const left = deadline - nowSeconds()
  return left > 0 ? span(left) : null
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
