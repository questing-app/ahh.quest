import { Hono } from 'hono'
import type { Env, AuthContext } from '../types'
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth'
import { createDbClient } from '../db/client'
import { getUserById, getUserByPubkey, updateUser, formatUser } from '../services/user.service'
import { nanoid } from 'nanoid'
import { StorageService } from '../services/storage.service'
import { BadRequest, NotFound } from '../lib/errors'
import { pathParam } from '../lib/params'

export const userRoutes = new Hono<{ Bindings: Env }>()

// GET /api/users/me
userRoutes.get('/me', authMiddleware, async (c) => {
  const auth = c.get('auth') as AuthContext
  const db = createDbClient(c.env)
  const user = await getUserById(db, auth.userId)
  if (!user) throw new NotFound('User not found')
  return c.json(formatUser(user))
})

// PATCH /api/users/me
userRoutes.patch('/me', authMiddleware, async (c) => {
  const auth = c.get('auth') as AuthContext
  const body = await c.req.json<{ username?: string; avatarUrl?: string | null }>()

  if (body.username) {
    if (body.username.length < 3 || body.username.length > 30) {
      throw new BadRequest('Username must be 3-30 characters')
    }
    if (!/^[a-zA-Z0-9._]+$/.test(body.username)) {
      throw new BadRequest('Username can only contain letters, numbers, dots, and underscores')
    }
  }

  const db = createDbClient(c.env)
  const user = await updateUser(db, auth.userId, {
    ...(body.username && { username: body.username }),
    // Photos are set by uploading one. This only takes the photo off.
    ...(body.avatarUrl === null && { avatarUrl: null }),
  })

  if (!user) throw new NotFound('User not found')
  return c.json(formatUser(user))
})

const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_AVATAR_BYTES = 1_000_000

// POST /api/users/me/avatar
// The body is the image itself. The app sends a small square JPEG.
userRoutes.post('/me/avatar', authMiddleware, async (c) => {
  const auth = c.get('auth') as AuthContext
  const contentType = (c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (!AVATAR_TYPES.includes(contentType)) throw new BadRequest('Photo must be a JPEG, PNG or WebP image')

  const body = await c.req.arrayBuffer()
  if (body.byteLength === 0) throw new BadRequest('No photo received')
  if (body.byteLength > MAX_AVATAR_BYTES) throw new BadRequest('Photo must be under 1 MB')

  const storage = new StorageService(c.env.R2, c.env.R2_PUBLIC_URL)
  const avatarUrl = await storage.uploadAvatar(auth.userId, nanoid(), body, contentType)

  const db = createDbClient(c.env)
  const user = await updateUser(db, auth.userId, { avatarUrl })
  if (!user) throw new NotFound('User not found')
  return c.json(formatUser(user))
})

// GET /api/users/:pubkey
userRoutes.get('/:pubkey', optionalAuthMiddleware, async (c) => {
  const pubkey = pathParam(c, 'pubkey')
  const db = createDbClient(c.env)
  const user = await getUserByPubkey(db, pubkey)
  if (!user) throw new NotFound('User not found')
  return c.json(formatUser(user))
})
