import { eq } from 'drizzle-orm'
import { pushSubscriptions } from '../db/schema'
import type { Database } from '../db/client'
import type { Env } from '../types'

export interface PushMessage {
  title: string
  body: string
  /** Path in the web app the notification opens. */
  url: string
}

// Push endpoints come from the browser, so only the real push services are
// accepted. Anything else would let a caller point our server at any URL.
const PUSH_HOSTS = [
  'fcm.googleapis.com',
  'push.apple.com',
  'push.services.mozilla.com',
  'notify.windows.com',
]

export function isPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && PUSH_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))
  } catch {
    return false
  }
}

export function pushConfigured(env: Env): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)
}

/** New accounts are named after their wallet until they pick a name. */
export function shownName(username: string | null | undefined): string {
  return !username || username.endsWith('...') ? 'Someone' : username
}

export function excerpt(text: string, max = 60): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

/**
 * Sends a notification to every device the user turned them on for. Never
 * throws and never blocks: a push that fails must not undo a settlement.
 */
export function notify(env: Env, db: Database, userId: string, message: PushMessage): void {
  if (!pushConfigured(env)) return
  void send(env, db, userId, message).catch((err) => console.error('push failed:', err))
}

async function send(env: Env, db: Database, userId: string, message: PushMessage) {
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).all()
  if (subs.length === 0) return

  const mod = await import('web-push')
  const webpush = mod.default ?? mod
  const options = {
    vapidDetails: {
      subject: env.VAPID_SUBJECT || env.WEB_URL || 'https://ahh.quest',
      publicKey: env.VAPID_PUBLIC_KEY!,
      privateKey: env.VAPID_PRIVATE_KEY!,
    },
    TTL: 86400,
    timeout: 8000,
  }

  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(message),
        options,
      )
    } catch (err) {
      // 404 and 410 mean the browser dropped the subscription.
      const status = (err as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint))
      } else {
        console.error(`push to ${new URL(sub.endpoint).hostname} failed:`, status ?? err)
      }
    }
  }))
}
