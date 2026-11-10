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

/** Live countdown as "23:41:07". Hours keep counting past 24. */
export function countdown(deadline: number): string {
  const left = Math.max(0, deadline - nowSeconds())
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(left / 3600))}:${pad(Math.floor((left % 3600) / 60))}:${pad(left % 60)}`
}

/** Short deadline for a pill: "40m left", "5h left", "2 days", "No limit". `soon` means under a day. */
export function deadlinePill(deadline: number | null): { label: string; soon: boolean } {
  if (!deadline) return { label: 'No limit', soon: false }
  const left = deadline - nowSeconds()
  if (left <= 0) return { label: 'Ended', soon: true }
  if (left < 3600) return { label: `${Math.max(1, Math.floor(left / 60))}m left`, soon: true }
  if (left < 86400) return { label: `${Math.floor(left / 3600)}h left`, soon: true }
  const days = Math.floor(left / 86400)
  return { label: days === 1 ? '1 day' : `${days} days`, soon: false }
}

/** Whole-unit time left: "40 min", "18 h", "2 days". Null once it has passed. */
export function roughLeft(deadline: number): string | null {
  const left = deadline - nowSeconds()
  if (left <= 0) return null
  if (left < 3600) return `${Math.max(1, Math.floor(left / 60))} min`
  if (left < 172800) return `${Math.floor(left / 3600)} h`
  return `${Math.floor(left / 86400)} days`
}

/** "Oct 30" */
export function shortDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric' })
}

/** "Oct 2026" */
export function monthYear(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString('en-US', { month: 'short', year: 'numeric' })
}

/** "Tonight, 9 pm", "Tomorrow, 9 pm", "Sat, Nov 14, 9 pm" */
export function closesAt(deadline: number): string {
  const when = new Date(deadline * 1000)
  const time = when
    .toLocaleString('en-US', { hour: 'numeric', minute: when.getMinutes() ? '2-digit' : undefined })
    .replace(' AM', ' am')
    .replace(' PM', ' pm')
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOfDay(when) - startOfDay(new Date())) / 86400000)
  if (days === 0) return `${when.getHours() >= 17 ? 'Tonight' : 'Today'}, ${time}`
  if (days === 1) return `Tomorrow, ${time}`
  return `${when.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}, ${time}`
}
