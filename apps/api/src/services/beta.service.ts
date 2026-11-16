import { createClient, type Client } from '@libsql/client'
import { PublicKey } from '@solana/web3.js'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import type { Env } from '../types'

// Beta access requests from the landing page. Kept in the API's own database,
// one row per wallet.

export const BETA_TABLE = [
  `CREATE TABLE IF NOT EXISTS beta_requests (
    id text PRIMARY KEY NOT NULL,
    created_at integer NOT NULL,
    name text NOT NULL,
    x_handle text NOT NULL,
    tg_handle text,
    wallet text NOT NULL UNIQUE,
    why_test text NOT NULL,
    how_use text NOT NULL,
    ip_hash text,
    user_agent text
  )`,
  'CREATE INDEX IF NOT EXISTS beta_created_idx ON beta_requests (created_at)',
]

const handle = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .transform((s) => s.replace(/^@/, ''))
    .pipe(z.string().regex(new RegExp(`^[A-Za-z0-9_]{${min},${max}}$`), `Enter a valid ${label}`))

const longText = (label: string) =>
  z.string().trim().min(10, `${label}: at least 10 characters`).max(1000, `${label}: 1000 characters at most`)

export const betaRequestSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(80, 'Name: 80 characters at most'),
  xHandle: handle(1, 15, 'X handle'),
  tgHandle: z
    .string()
    .trim()
    .optional()
    .transform((s) => (s ? s.replace(/^@/, '') : undefined))
    .pipe(z.string().regex(/^[A-Za-z0-9_]{5,32}$/, 'Enter a valid Telegram handle').optional()),
  wallet: z
    .string()
    .trim()
    .refine((s) => {
      try {
        return new PublicKey(s).toBytes().length === 32 && new PublicKey(s).toBase58() === s
      } catch {
        return false
      }
    }, 'Enter a valid Solana wallet address'),
  whyTest: longText('Why you want to test'),
  howUse: longText('How you would use it'),
  // Honeypot: hidden from people, filled in by bots.
  website: z.string().optional(),
})

export type BetaRequestInput = z.infer<typeof betaRequestSchema>

export function betaClient(env: Env): Client {
  return createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })
}

export async function hashIp(ip: string, salt: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${ip}`))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Stores a request; returns false when that wallet has already asked. */
export async function saveBetaRequest(
  db: Client,
  input: BetaRequestInput,
  meta: { ipHash: string | null; userAgent: string | null },
): Promise<boolean> {
  const res = await db.execute({
    sql: `INSERT INTO beta_requests (id, created_at, name, x_handle, tg_handle, wallet, why_test, how_use, ip_hash, user_agent)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(wallet) DO NOTHING`,
    args: [
      nanoid(),
      Math.floor(Date.now() / 1000),
      input.name,
      input.xHandle,
      input.tgHandle ?? null,
      input.wallet,
      input.whyTest,
      input.howUse,
      meta.ipHash,
      meta.userAgent?.slice(0, 300) ?? null,
    ],
  })
  return res.rowsAffected > 0
}

export const BETA_COLUMNS = [
  'id',
  'created_at',
  'name',
  'x_handle',
  'tg_handle',
  'wallet',
  'why_test',
  'how_use',
  'ip_hash',
  'user_agent',
] as const

export async function listBetaRequests(db: Client) {
  const res = await db.execute(`SELECT ${BETA_COLUMNS.join(', ')} FROM beta_requests ORDER BY created_at DESC`)
  return res.rows.map((row) => Object.fromEntries(BETA_COLUMNS.map((c) => [c, row[c] ?? null])))
}

export async function deleteBetaRequest(db: Client, id: string) {
  return (await db.execute({ sql: 'DELETE FROM beta_requests WHERE id = ?', args: [id] })).rowsAffected
}

/** RFC 4180 CSV; cells starting with = + - @ are prefixed so spreadsheets don't run them. */
export function toCsv(rows: Record<string, unknown>[]) {
  const cell = (v: unknown) => {
    let s = v == null ? '' : String(v)
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [BETA_COLUMNS.join(','), ...rows.map((r) => BETA_COLUMNS.map((c) => cell(r[c])).join(','))].join('\r\n') + '\r\n'
}
