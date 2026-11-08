import { Hono } from 'hono'
import type { Env, AuthContext } from '../types'
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth'
import { createDbClient } from '../db/client'
import { quests, claims } from '../db/schema'
import { eq, desc, inArray } from 'drizzle-orm'
import { formatQuestsWithCreators } from '../services/quest.service'
import { formatClaim } from '../services/claim.service'

export const feedRoutes = new Hono<{ Bindings: Env }>()

// GET /api/feed — public open quests
feedRoutes.get('/', optionalAuthMiddleware, async (c) => {
  const db = createDbClient(c.env)
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 50)
  const offset = parseInt(c.req.query('offset') || '0')

  const results = await db.select()
    .from(quests)
    .where(eq(quests.status, 'active'))
    .orderBy(desc(quests.createdAt))
    .limit(limit)
    .offset(offset)
    .all()

  return c.json(await formatQuestsWithCreators(db, results))
})

// GET /api/feed/mine — user's quests + claims
feedRoutes.get('/mine', authMiddleware, async (c) => {
  const auth = c.get('auth') as AuthContext
  const db = createDbClient(c.env)

  const myQuests = await db.select()
    .from(quests)
    .where(eq(quests.creatorId, auth.userId))
    .orderBy(desc(quests.createdAt))
    .all()

  const myClaims = await db.select()
    .from(claims)
    .where(eq(claims.claimerId, auth.userId))
    .orderBy(desc(claims.claimedAt))
    .all()

  // Claims are listed with their quest so the client can render them directly.
  const claimedQuestIds = [...new Set(myClaims.map((cl) => cl.questId))]
  const claimedQuests = claimedQuestIds.length
    ? await db.select().from(quests).where(inArray(quests.id, claimedQuestIds)).all()
    : []
  const questById = new Map(
    (await formatQuestsWithCreators(db, claimedQuests)).map((q) => [q.id, q]),
  )

  return c.json({
    quests: await formatQuestsWithCreators(db, myQuests),
    claims: myClaims.map((cl) => ({ ...formatClaim(cl), quest: questById.get(cl.questId) ?? null })),
  })
})
