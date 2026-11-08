import type { Context, Next } from 'hono'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { Env, AuthContext } from '../types'
import { fetchSolanaWallet, verifyPrivyToken } from '../lib/privy'
import { createDbClient } from '../db/client'
import { users } from '../db/schema'

const SUSPENDED_AT_FLAGS = 3

type Resolved = { auth: AuthContext } | { error: string; status: 401 | 403 }

// Known users resolve from the database. A first sign-in asks Privy for the
// wallet and creates the account.
async function resolve(c: Context<{ Bindings: Env }>, create: boolean): Promise<Resolved | null> {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) return null

  let privyUserId: string
  try {
    privyUserId = await verifyPrivyToken(header.slice(7), c.env)
  } catch {
    return { error: 'Invalid token', status: 401 }
  }

  const db = createDbClient(c.env)
  let user = await db.select().from(users).where(eq(users.privyUserId, privyUserId)).get()

  if (!user) {
    if (!create) return null
    const pubkey = await fetchSolanaWallet(privyUserId, c.env)
    if (!pubkey) return { error: 'No Solana wallet linked yet', status: 401 }
    user = {
      id: nanoid(),
      privyUserId,
      pubkey,
      username: pubkey.slice(0, 8) + '...',
      avatarUrl: null,
      questsCompleted: 0,
      questsPosted: 0,
      activeClaims: 0,
      flags: 0,
      createdAt: Math.floor(Date.now() / 1000),
    }
    await db.insert(users).values(user).onConflictDoNothing()
    user = (await db.select().from(users).where(eq(users.privyUserId, privyUserId)).get())!
  }

  if (user.flags >= SUSPENDED_AT_FLAGS) return { error: 'Account suspended', status: 403 }
  return { auth: { userId: user.id, pubkey: user.pubkey, privyUserId } }
}

export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const result = await resolve(c, true)
  if (!result) return c.json({ error: 'Missing authorization' }, 401)
  if ('error' in result) return c.json({ error: result.error }, result.status)
  c.set('auth', result.auth)
  await next()
}

export async function optionalAuthMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const result = await resolve(c, false)
  c.set('auth', result && 'auth' in result ? result.auth : null)
  await next()
}
