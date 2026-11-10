import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import type { Env, AuthContext } from '../types'
import { authMiddleware } from '../middleware/auth'
import { createDbClient } from '../db/client'
import { pushSubscriptions } from '../db/schema'
import { isPushEndpoint, pushConfigured } from '../services/push.service'
import { BadRequest } from '../lib/errors'

export const pushRoutes = new Hono<{ Bindings: Env }>()

// GET /api/push/key
// The browser needs the public key to subscribe. null means push is off.
pushRoutes.get('/key', (c) => c.json({ publicKey: pushConfigured(c.env) ? c.env.VAPID_PUBLIC_KEY : null }))

// POST /api/push/subscribe
pushRoutes.post('/subscribe', authMiddleware, async (c) => {
  const auth = c.get('auth') as AuthContext
  const body = await c.req.json().catch(() => null) as
    | { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
    | null

  const endpoint = body?.endpoint
  const p256dh = body?.keys?.p256dh
  const authKey = body?.keys?.auth
  if (
    typeof endpoint !== 'string' || endpoint.length > 1000 || !isPushEndpoint(endpoint) ||
    typeof p256dh !== 'string' || p256dh.length > 200 ||
    typeof authKey !== 'string' || authKey.length > 100
  ) {
    throw new BadRequest('Invalid push subscription')
  }

  // A browser has one subscription; signing in as someone else moves it.
  const db = createDbClient(c.env)
  await db.insert(pushSubscriptions)
    .values({ endpoint, userId: auth.userId, p256dh, auth: authKey, createdAt: Math.floor(Date.now() / 1000) })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: auth.userId, p256dh, auth: authKey } })

  return c.json({ ok: true }, 201)
})

// DELETE /api/push/subscribe
pushRoutes.delete('/subscribe', authMiddleware, async (c) => {
  const auth = c.get('auth') as AuthContext
  const body = await c.req.json().catch(() => null) as { endpoint?: unknown } | null
  if (typeof body?.endpoint !== 'string') throw new BadRequest('endpoint is required')

  const db = createDbClient(c.env)
  await db.delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, body.endpoint), eq(pushSubscriptions.userId, auth.userId)))
  return c.body(null, 204)
})
