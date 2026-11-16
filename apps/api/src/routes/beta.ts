import { Hono } from 'hono'
import type { Env } from '../types'
import { betaClient, betaRequestSchema, hashIp, saveBetaRequest } from '../services/beta.service'

export const BETA_WINDOW_MS = 60 * 60 * 1000
export const BETA_MAX_PER_WINDOW = 5

function clientIp(header: (name: string) => string | undefined) {
  return header('cf-connecting-ip') || header('x-forwarded-for')?.split(',')[0].trim() || header('x-real-ip') || 'unknown'
}

async function allow(kv: KVNamespace, ip: string) {
  const key = `rl:beta:${ip}`
  const now = Date.now()
  const stored = await kv.get(key)
  const recent = (stored ? (JSON.parse(stored) as number[]) : []).filter((t) => t > now - BETA_WINDOW_MS)
  if (recent.length >= BETA_MAX_PER_WINDOW) return false
  recent.push(now)
  await kv.put(key, JSON.stringify(recent), { expirationTtl: Math.ceil(BETA_WINDOW_MS / 1000) + 60 })
  return true
}

export const betaRoutes = new Hono<{ Bindings: Env }>()

// POST /api/beta-requests  { name, xHandle, tgHandle?, wallet, whyTest, howUse, website? }
betaRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'Send the form as JSON' }, 400)

  const parsed = betaRequestSchema.safeParse(body)
  if (!parsed.success) {
    const fields: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form')
      fields[key] ??= issue.message
    }
    return c.json({ error: 'Check the highlighted fields', fields }, 400)
  }

  // A filled honeypot looks like success to the bot but stores nothing.
  if (parsed.data.website) return c.json({ ok: true })

  const ip = clientIp((n) => c.req.header(n))
  if (!(await allow(c.env.RATE_LIMIT_KV, ip))) {
    return c.json({ error: 'Too many requests from here. Try again in an hour.' }, 429)
  }

  const saved = await saveBetaRequest(betaClient(c.env), parsed.data, {
    ipHash: ip === 'unknown' ? null : await hashIp(ip, c.env.WEBHOOK_SECRET ?? ''),
    userAgent: c.req.header('user-agent') ?? null,
  })
  if (!saved) return c.json({ ok: true, already: true, message: 'This wallet has already requested access. You’re on the list.' })
  return c.json({ ok: true })
})
