import { createClient } from '@libsql/client'
import type { Env } from '../types'

// Additive columns added after the tables were created. Each runs once:
// it checks the live table first, so restarts are no-ops.
const COLUMNS: { table: string; column: string; ddl: string }[] = [
  { table: 'proofs', column: 'reject_reason', ddl: 'ALTER TABLE proofs ADD COLUMN reject_reason text' },
  { table: 'claims', column: 'settled_at', ddl: 'ALTER TABLE claims ADD COLUMN settled_at integer' },
  { table: 'quests', column: 'closed_at', ddl: 'ALTER TABLE quests ADD COLUMN closed_at integer' },
  { table: 'quests', column: 'image_url', ddl: 'ALTER TABLE quests ADD COLUMN image_url text' },
  { table: 'quests', column: 'image_tries', ddl: 'ALTER TABLE quests ADD COLUMN image_tries integer NOT NULL DEFAULT 0' },
  { table: 'quests', column: 'image_tried_at', ddl: 'ALTER TABLE quests ADD COLUMN image_tried_at integer' },
]

const TABLES = [
  `CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint text PRIMARY KEY NOT NULL,
    user_id text NOT NULL REFERENCES users(id),
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at integer NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS push_user_idx ON push_subscriptions (user_id)',
  `CREATE TABLE IF NOT EXISTS house_dares (
    id text PRIMARY KEY NOT NULL,
    agent integer NOT NULL,
    description text NOT NULL UNIQUE,
    reward_amount integer NOT NULL,
    time_limit integer,
    used_quest_id text,
    created_at integer NOT NULL
  )`,
]

export async function ensureSchema(env: Env) {
  const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })
  for (const { table, column, ddl } of COLUMNS) {
    const info = await db.execute(`PRAGMA table_info(${table})`)
    if (!info.rows.some((row) => row.name === column)) {
      await db.execute(ddl)
      console.log(`schema: added ${table}.${column}`)
    }
  }
  for (const ddl of TABLES) await db.execute(ddl)
}
