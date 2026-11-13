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
  `CREATE TABLE IF NOT EXISTS meta (
    key text PRIMARY KEY NOT NULL,
    value text NOT NULL
  )`,
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
  await checkNetwork(db, env)
}

/**
 * A database belongs to one network. Quest rows are keyed by their on-chain
 * number, and devnet and mainnet both count from 0, so pointing a mainnet API
 * at a devnet database would mix up quests and settle the wrong ones. The
 * first run stamps the database with QUEST_MINT; any later run with a
 * different mint refuses to start.
 */
async function checkNetwork(db: ReturnType<typeof createClient>, env: Env) {
  const stamped = await db.execute({ sql: 'SELECT value FROM meta WHERE key = ?', args: ['quest_mint'] })
  const mint = stamped.rows[0]?.value as string | undefined
  if (mint) {
    if (mint !== env.QUEST_MINT) {
      throw new Error(
        `This database belongs to QUEST mint ${mint} but QUEST_MINT is ${env.QUEST_MINT}. ` +
        'Use a separate database for each network.',
      )
    }
    return
  }
  // Not stamped yet: an existing database must hold only quests in this mint.
  const other = await db.execute({
    sql: 'SELECT reward_mint FROM quests WHERE reward_mint != ? LIMIT 1',
    args: [env.QUEST_MINT],
  })
  if (other.rows.length > 0) {
    throw new Error(
      `This database holds quests in mint ${other.rows[0].reward_mint} but QUEST_MINT is ${env.QUEST_MINT}. ` +
      'Use a separate database for each network.',
    )
  }
  await db.execute({ sql: 'INSERT INTO meta (key, value) VALUES (?, ?)', args: ['quest_mint', env.QUEST_MINT] })
  console.log(`schema: database stamped for QUEST mint ${env.QUEST_MINT}`)
}
