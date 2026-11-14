import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rpcRoutes, RPC_MAX_BATCH, RPC_MAX_REQUESTS } from './rpc'
import { MemoryKV } from '../node/bindings'
import type { Env } from '../types'

const UPSTREAM = 'https://rpc.example/?api-key=secret'

function makeEnv(): Env {
  return { SOLANA_RPC_URL: UPSTREAM, RATE_LIMIT_KV: new MemoryKV() } as unknown as Env
}

function post(env: Env, body: unknown, ip = '1.2.3.4') {
  return rpcRoutes.request(
    '/',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    },
    env,
  )
}

describe('rpc proxy', () => {
  let fetchMock: ReturnType<typeof vi.fn<any[], Promise<Response>>>

  beforeEach(() => {
    fetchMock = vi.fn<any[], Promise<Response>>(async () =>
      new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { value: 42 } }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('forwards an allowed method to SOLANA_RPC_URL and returns the result', async () => {
    const res = await post(makeEnv(), { jsonrpc: '2.0', id: 1, method: 'getBalance', params: ['x'] })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ jsonrpc: '2.0', id: 1, result: { value: 42 } })
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(UPSTREAM)
    expect(JSON.parse(init.body)).toMatchObject({ method: 'getBalance' })
  })

  it('never echoes the upstream URL or key', async () => {
    const res = await post(makeEnv(), { jsonrpc: '2.0', id: 1, method: 'getBalance', params: [] })
    expect(await res.text()).not.toContain('secret')
  })

  it('refuses methods outside the allowlist without calling upstream', async () => {
    const res = await post(makeEnv(), { jsonrpc: '2.0', id: 7, method: 'getProgramAccounts', params: [] })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ id: 7, error: { code: -32601 } })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepts batches only when every call is allowed', async () => {
    const env = makeEnv()
    const ok = await post(env, [
      { jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash' },
      { jsonrpc: '2.0', id: 2, method: 'getSignatureStatuses', params: [['sig']] },
    ])
    expect(ok.status).toBe(200)

    const mixed = await post(env, [
      { jsonrpc: '2.0', id: 1, method: 'getBalance' },
      { jsonrpc: '2.0', id: 2, method: 'requestAirdrop' },
    ])
    expect(mixed.status).toBe(403)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('rejects oversized batches, empty batches and bad JSON', async () => {
    const env = makeEnv()
    const big = Array.from({ length: RPC_MAX_BATCH + 1 }, (_, i) => ({ jsonrpc: '2.0', id: i, method: 'getSlot' }))
    expect((await post(env, big)).status).toBe(400)
    expect((await post(env, [])).status).toBe(400)
    expect((await post(env, '{not json')).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rate limits per IP, counting each call in a batch', async () => {
    const env = makeEnv()
    const batch = Array.from({ length: RPC_MAX_BATCH }, (_, i) => ({ jsonrpc: '2.0', id: i, method: 'getSlot' }))
    const full = RPC_MAX_REQUESTS / RPC_MAX_BATCH
    for (let i = 0; i < full; i++) expect((await post(env, batch)).status).toBe(200)

    const limited = await post(env, { jsonrpc: '2.0', id: 1, method: 'getSlot' })
    expect(limited.status).toBe(429)
    // another IP is unaffected
    expect((await post(env, { jsonrpc: '2.0', id: 1, method: 'getSlot' }, '5.6.7.8')).status).toBe(200)
  })

  it('returns 502 when the upstream RPC is unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
    const res = await post(makeEnv(), { jsonrpc: '2.0', id: 3, method: 'getSlot' })
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ id: 3, error: { code: -32603 } })
  })
})
