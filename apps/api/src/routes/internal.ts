import { Hono } from 'hono'
import type { Context, Next } from 'hono'
import { and, eq, isNull, ne, notLike, or } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { Env } from '../types'
import { createDbClient } from '../db/client'
import { quests, users } from '../db/schema'
import { BadRequest, NotFound, Unauthorized } from '../lib/errors'
import { StorageService } from '../services/storage.service'
import { ART_FOLDER, paintMissingArt, storeArt } from '../services/quest-art.service'
import { clearHouse, houseUser, runHouse, seedHouse, type HouseSeed } from '../services/house.service'

// Operator endpoints. Every call needs the internal key in x-internal-key.
export const internalRoutes = new Hono<{ Bindings: Env }>()

async function digest(text: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

internalRoutes.use('*', async (c: Context<{ Bindings: Env }>, next: Next) => {
  const given = c.req.header('x-internal-key')
  if (!given || !c.env.WEBHOOK_SECRET) throw new Unauthorized()
  // Compare hashes so the check takes the same time wherever they differ.
  const [a, b] = await Promise.all([digest(given), digest(c.env.WEBHOOK_SECRET)])
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  if (diff !== 0) throw new Unauthorized()
  await next()
})

const IMAGE_TYPES = ['image/webp', 'image/jpeg', 'image/png']
const MAX_IMAGE = 4 * 1024 * 1024

async function imageBody(c: Context<{ Bindings: Env }>) {
  const contentType = c.req.header('content-type') ?? ''
  if (!IMAGE_TYPES.includes(contentType)) throw new BadRequest('Send a webp, jpeg or png')
  const body = await c.req.arrayBuffer()
  if (!body.byteLength || body.byteLength > MAX_IMAGE) throw new BadRequest('Image is empty or over 4 MB')
  return { body, contentType }
}

// PUT /api/internal/art/:hash
// Stores the featured picture for a dare (by the hex sha256 of its text) and
// attaches it to every quest with that dare, replacing an older picture.
internalRoutes.put('/art/:hash', async (c) => {
  const hash = c.req.param('hash')
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new BadRequest('hash must be a hex sha256')
  const { body, contentType } = await imageBody(c)
  const url = await storeArt(c.env, hash, body, contentType)
  const db = createDbClient(c.env)
  const res = await db.update(quests).set({ imageUrl: url })
    .where(and(eq(quests.descriptionHash, hash), or(isNull(quests.imageUrl), ne(quests.imageUrl, url))))
  return c.json({ url, attached: res.rowsAffected })
})

// POST /api/internal/art/paint  — run the painter now instead of waiting for the crank.
internalRoutes.post('/art/paint', async (c) => {
  await paintMissingArt(c.env, createDbClient(c.env), 8)
  return c.json({ ok: true })
})

// GET /api/internal/art/missing — quests with no picture, or one in an older style.
internalRoutes.get('/art/missing', async (c) => {
  const rows = await createDbClient(c.env)
    .select({ id: quests.id, description: quests.description, hash: quests.descriptionHash, status: quests.status })
    .from(quests)
    .where(or(isNull(quests.imageUrl), notLike(quests.imageUrl, `%/${ART_FOLDER}%`)))
    .all()
  return c.json(rows)
})

// POST /api/internal/house/seed  { agents, dares }
internalRoutes.post('/house/seed', async (c) => {
  const seed = await c.req.json<HouseSeed>()
  return c.json(await seedHouse(c.env, createDbClient(c.env), seed))
})

// POST /api/internal/house/clear
// Empties the dare queue and takes down the house posts nobody has picked up.
internalRoutes.post('/house/clear', async (c) => {
  return c.json(await clearHouse(c.env, createDbClient(c.env)))
})

// PUT /api/internal/house/:agent/avatar
internalRoutes.put('/house/:agent/avatar', async (c) => {
  const db = createDbClient(c.env)
  const user = await houseUser(db, Number(c.req.param('agent')))
  if (!user) throw new NotFound('No such account')
  const { body, contentType } = await imageBody(c)
  const avatarUrl = await new StorageService(c.env.R2, c.env.R2_PUBLIC_URL)
    .uploadAvatar(user.id, nanoid(), body, contentType)
  await db.update(users).set({ avatarUrl }).where(eq(users.id, user.id))
  return c.json({ ok: true })
})

// POST /api/internal/house/run  { force?: boolean }
internalRoutes.post('/house/run', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { force?: boolean }
  return c.json(await runHouse(c.env, createDbClient(c.env), { force: body.force === true }))
})
