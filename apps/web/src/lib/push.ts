import type { RequestOptions } from './api'

type Api = <T>(path: string, opts?: Omit<RequestOptions, 'token'>) => Promise<T>

/**
 * on / off            this phone can get notifications
 * blocked             the person said no in the system prompt
 * needs-install       iPhone: only works once Quest is on the Home Screen
 * unsupported         this browser can't do it at all
 */
export type PushState = 'on' | 'off' | 'blocked' | 'needs-install' | 'unsupported'

const supported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

async function subscription(): Promise<PushSubscription | null> {
  if (!supported()) return null
  const registration = await navigator.serviceWorker.getRegistration('/')
  return (await registration?.pushManager.getSubscription()) ?? null
}

export async function pushState(): Promise<PushState> {
  if (!supported()) {
    const nav = navigator as Navigator & { standalone?: boolean }
    const iphone = /iPhone|iPad|iPod/.test(navigator.userAgent)
    return iphone && nav.standalone !== true ? 'needs-install' : 'unsupported'
  }
  if (Notification.permission === 'denied') return 'blocked'
  return (await subscription()) ? 'on' : 'off'
}

function keyBytes(base64url: string): ArrayBuffer {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes.buffer
}

/** Must run straight from a tap: iOS only shows the permission prompt then. */
export async function enablePush(api: Api, publicKey: string): Promise<void> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notifications are blocked. Allow them for Quest in your phone’s settings.')
  }
  await navigator.serviceWorker.register('/sw.js')
  const registration = await navigator.serviceWorker.ready
  const sub =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }))
  await api('/api/push/subscribe', { json: sub.toJSON() })
}

export async function disablePush(api: Api): Promise<void> {
  const sub = await subscription()
  if (!sub) return
  await api('/api/push/subscribe', { method: 'DELETE', json: { endpoint: sub.endpoint } }).catch(() => {})
  await sub.unsubscribe()
}

/** After sign-in: point this phone's notifications at whoever is signed in now. */
export async function syncPush(api: Api): Promise<void> {
  const sub = await subscription()
  if (sub) await api('/api/push/subscribe', { json: sub.toJSON() })
}

/** Before sign-out: stop sending this phone the old account's notifications. */
export async function detachPush(api: Api): Promise<void> {
  const sub = await subscription()
  if (sub) await api('/api/push/subscribe', { method: 'DELETE', json: { endpoint: sub.endpoint } })
}
