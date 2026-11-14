import { Hono } from 'hono'
import type { Env } from '../types'

/**
 * Solana JSON-RPC proxy for the web app. The browser talks to /rpc and this
 * forwards to SOLANA_RPC_URL, so a paid RPC key never reaches the client.
 *
 * Only the methods the app (and Privy's wallet) need are passed through;
 * anything else, like getProgramAccounts, is refused so nobody can spend the
 * RPC plan on heavy calls. Requests are rate limited per IP.
 */
export const RPC_METHODS = new Set([
  // reads
  'getAccountInfo',
  'getMultipleAccounts',
  'getBalance',
  'getTokenAccountBalance',
  'getTokenAccountsByOwner',
  'getMinimumBalanceForRentExemption',
  'getFeeForMessage',
  'getRecentPrioritizationFees',
  // chain state
  'getLatestBlockhash',
  'isBlockhashValid',
  'getBlockHeight',
  'getSlot',
  'getEpochInfo',
  'getGenesisHash',
  'getVersion',
  'getHealth',
  // sending
  'simulateTransaction',
  'sendTransaction',
  'getSignatureStatuses',
])

export const RPC_WINDOW_MS = 60_000
export const RPC_MAX_REQUESTS = 300 // per IP per window; batches count each call
export const RPC_MAX_BATCH = 20
export const RPC_MAX_BODY = 64 * 1024

type RpcCall = { jsonrpc?: string; id?: unknown; method?: unknown; params?: unknown }

function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }
}

function clientIp(header: (name: string) => string | undefined) {
  return (
    header('cf-connecting-ip') ||
    header('x-forwarded-for')?.split(',')[0].trim() ||
    header('x-real-ip') ||
    'unknown'
  )
}

/** Sliding-window limit; returns false once `cost` more calls would exceed it. */
async function allow(kv: KVNamespace, ip: string, cost: number) {
  const key = `rl:rpc:${ip}`
  const now = Date.now()
  const stored = await kv.get(key)
  const recent = (stored ? (JSON.parse(stored) as number[]) : []).filter((t) => t > now - RPC_WINDOW_MS)
  if (recent.length + cost > RPC_MAX_REQUESTS) return false
  for (let i = 0; i < cost; i++) recent.push(now)
  await kv.put(key, JSON.stringify(recent), { expirationTtl: Math.ceil(RPC_WINDOW_MS / 1000) + 60 })
  return true
}

export const rpcRoutes = new Hono<{ Bindings: Env }>()

rpcRoutes.post('/', async (c) => {
  const raw = await c.req.text()
  if (raw.length > RPC_MAX_BODY) return c.json(rpcError(null, -32600, 'Request too large'), 413)

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return c.json(rpcError(null, -32700, 'Parse error'), 400)
  }

  const isBatch = Array.isArray(body)
  const calls = (isBatch ? body : [body]) as RpcCall[]
  if (calls.length === 0 || calls.length > RPC_MAX_BATCH) {
    return c.json(rpcError(null, -32600, `Batch must hold 1 to ${RPC_MAX_BATCH} calls`), 400)
  }
  for (const call of calls) {
    if (!call || typeof call !== 'object' || typeof call.method !== 'string') {
      return c.json(rpcError(call?.id, -32600, 'Invalid request'), 400)
    }
    if (!RPC_METHODS.has(call.method)) {
      return c.json(rpcError(call.id, -32601, `Method not allowed: ${call.method}`), 403)
    }
  }

  if (!(await allow(c.env.RATE_LIMIT_KV, clientIp((n) => c.req.header(n)), calls.length))) {
    return c.json(rpcError(isBatch ? null : calls[0].id, -32005, 'Rate limit exceeded'), 429)
  }

  let upstream: Response
  try {
    upstream = await fetch(c.env.SOLANA_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: raw,
    })
  } catch (err) {
    console.error('rpc proxy: upstream unreachable', (err as Error).message)
    return c.json(rpcError(isBatch ? null : calls[0].id, -32603, 'RPC unavailable'), 502)
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
  })
})
