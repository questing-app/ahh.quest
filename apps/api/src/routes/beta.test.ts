import { beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { Keypair } from '@solana/web3.js'
import { betaRoutes, BETA_MAX_PER_WINDOW } from './beta'
import { app } from '../index'
import { BETA_TABLE, toCsv } from '../services/beta.service'
import { MemoryKV } from '../node/bindings'
import type { Env } from '../types'

const SECRET = 'test-internal-key'
let env: Env

beforeEach(async () => {
  const url = `file:${join(mkdtempSync(join(tmpdir(), 'beta-')), 'db.sqlite')}`
  const db = createClient({ url })
  for (const ddl of BETA_TABLE) await db.execute(ddl)
  env = { TURSO_DATABASE_URL: url, RATE_LIMIT_KV: new MemoryKV(), WEBHOOK_SECRET: SECRET } as unknown as Env
})

const valid = () => ({
  name: 'Test Person',
  xHandle: '@test_person',
  tgHandle: '@test_tg_handle',
  wallet: Keypair.generate().publicKey.toBase58(),
  whyTest: 'I want to try posting dares.',
  howUse: 'Post a few dares for friends.',
})

function submit(body: unknown, ip = '1.2.3.4') {
  return betaRoutes.request(
    '/',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip, 'user-agent': 'vitest' },
      body: JSON.stringify(body),
    },
    env,
  )
}

function exportRows(format = '', key = SECRET) {
  return app.request(`/api/internal/beta-requests${format}`, { headers: { 'x-internal-key': key } }, env)
}

describe('beta requests', () => {
  it('stores a valid request with @ stripped from handles', async () => {
    const res = await submit(valid())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    const rows = (await (await exportRows()).json()) as any[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ x_handle: 'test_person', tg_handle: 'test_tg_handle', name: 'Test Person' })
    expect(rows[0].ip_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(rows[0].ip_hash).not.toContain('1.2.3.4')
  })

  it('treats the Telegram handle as optional', async () => {
    const { tgHandle, ...rest } = valid()
    expect((await submit(rest)).status).toBe(200)
    expect((await submit({ ...valid(), tgHandle: '' })).status).toBe(200)
  })

  it('rejects bad fields with a message per field', async () => {
    const res = await submit({ ...valid(), name: '', xHandle: 'has space', tgHandle: 'abc', wallet: 'not-a-wallet', whyTest: 'short' })
    expect(res.status).toBe(400)
    const { fields } = (await res.json()) as { fields: Record<string, string> }
    expect(Object.keys(fields).sort()).toEqual(['name', 'tgHandle', 'wallet', 'whyTest', 'xHandle'])
  })

  it('rejects an X handle over 15 characters and text over 1000', async () => {
    expect((await submit({ ...valid(), xHandle: 'a'.repeat(16) })).status).toBe(400)
    expect((await submit({ ...valid(), howUse: 'a'.repeat(1001) })).status).toBe(400)
  })

  it('answers a repeat wallet kindly without a second row', async () => {
    const first = valid()
    await submit(first)
    const again = await submit({ ...valid(), wallet: first.wallet })
    expect(again.status).toBe(200)
    expect(await again.json()).toMatchObject({ ok: true, already: true })
    expect(await (await exportRows()).json()).toHaveLength(1)
  })

  it('accepts but drops a filled honeypot', async () => {
    const res = await submit({ ...valid(), website: 'http://spam.example' })
    expect(res.status).toBe(200)
    expect(await (await exportRows()).json()).toHaveLength(0)
  })

  it('limits each IP per hour', async () => {
    for (let i = 0; i < BETA_MAX_PER_WINDOW; i++) expect((await submit(valid())).status).toBe(200)
    expect((await submit(valid())).status).toBe(429)
    expect((await submit(valid(), '9.9.9.9')).status).toBe(200)
  })

  it('exports only with the internal key, as JSON or CSV, and deletes by id', async () => {
    await submit({ ...valid(), name: '=HYPERLINK("x")' })
    expect((await exportRows('', 'wrong')).status).toBe(401)
    const csv = await exportRows('?format=csv')
    expect(csv.headers.get('content-type')).toContain('text/csv')
    const text = await csv.text()
    expect(text.split('\r\n')[0]).toBe('id,created_at,name,x_handle,tg_handle,wallet,why_test,how_use,ip_hash,user_agent')
    expect(text).toContain(`"'=HYPERLINK(""x"")"`)

    const [row] = (await (await exportRows()).json()) as any[]
    const del = await app.request(`/api/internal/beta-requests/${row.id}`, { method: 'DELETE', headers: { 'x-internal-key': SECRET } }, env)
    expect(del.status).toBe(200)
    expect(await (await exportRows()).json()).toHaveLength(0)
  })

  it('quotes commas and newlines in CSV', () => {
    expect(toCsv([{ id: 'a', name: 'x, "y"\nz' }]).split('\r\n')[1]).toBe('a,,"x, ""y""\nz",,,,,,,')
  })
})
