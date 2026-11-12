import { Hono } from 'hono'
import type { Env, AuthContext } from '../types'
import { authMiddleware } from '../middleware/auth'
import { nanoid } from 'nanoid'
import { StorageService } from '../services/storage.service'
import { eq } from 'drizzle-orm'
import { createDbClient } from '../db/client'
import { claims } from '../db/schema'
import { BadRequest, Forbidden, NotFound } from '../lib/errors'

export const mediaRoutes = new Hono<{ Bindings: Env }>()

// POST /api/media/upload — proxy upload to R2
mediaRoutes.post('/upload', authMiddleware, async (c) => {
  const auth = c.get('auth') as AuthContext
  const contentType = c.req.header('content-type') || ''

  if (!contentType.startsWith('video/')) {
    throw new BadRequest('Content-Type must be video/*')
  }

  const fileId = nanoid()
  const storage = new StorageService(c.env.R2, c.env.R2_PUBLIC_URL)
  const body = c.req.raw.body

  if (!body) throw new BadRequest('No body')

  const url = await storage.uploadVideo(auth.userId, fileId, body, contentType)

  // Compute SHA-256 hash
  // Note: we already consumed the stream for upload, so the client should
  // compute the hash client-side and include it in the proof submission.
  // This endpoint just handles the upload.

  return c.json({ uploadUrl: url, fileId })
})

// POST /api/media/upload-frame — upload a single frame
mediaRoutes.post('/upload-frame', authMiddleware, async (c) => {
  const claimId = c.req.header('x-claim-id')
  const frameIndex = c.req.header('x-frame-index')

  if (!claimId || frameIndex === null || frameIndex === undefined) {
    throw new BadRequest('x-claim-id and x-frame-index headers required')
  }

  const auth = c.get('auth') as AuthContext
  const db = createDbClient(c.env)
  const claim = await db.select({ claimerId: claims.claimerId, status: claims.status })
    .from(claims).where(eq(claims.id, claimId)).get()
  if (!claim || claim.claimerId !== auth.userId) throw new Forbidden('Not your claim')
  if (claim.status !== 'active') throw new BadRequest('Claim is not active')

  const body = await c.req.arrayBuffer()
  const storage = new StorageService(c.env.R2, c.env.R2_PUBLIC_URL)
  const key = await storage.uploadFrame(claimId, parseInt(frameIndex), body)

  return c.json({ key })
})

// GET /media/videos/..., /media/thumbnails/... and /media/avatars/...
// Serves public media straight from R2. Frames stay private to the verifier.
export const publicMediaRoutes = new Hono<{ Bindings: Env }>()

publicMediaRoutes.get('/:kind{videos|thumbnails|avatars|quests}/*', async (c) => {
  const key = c.req.path.replace(/^\/media\//, '')
  const range = c.req.header('range')?.match(/bytes=(\d+)-(\d*)/)
  const object = await c.env.R2.get(key, range ? {
    range: range[2]
      ? { offset: Number(range[1]), length: Number(range[2]) - Number(range[1]) + 1 }
      : { offset: Number(range[1]) },
  } : undefined)
  if (!object) throw new NotFound('Not found')

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('accept-ranges', 'bytes')
  headers.set('x-content-type-options', 'nosniff')
  headers.set('cache-control', 'public, max-age=31536000, immutable')
  if (range && 'range' in object && object.range && 'offset' in object.range) {
    const start = object.range.offset ?? 0
    const end = start + (object.range.length ?? object.size - start) - 1
    headers.set('content-range', `bytes ${start}-${end}/${object.size}`)
    headers.set('content-length', String(end - start + 1))
    return new Response(object.body, { status: 206, headers })
  }
  headers.set('content-length', String(object.size))
  return new Response(object.body, { headers })
})
