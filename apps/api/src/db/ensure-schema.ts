import { createClient } from '@libsql/client'
import type { Env } from '../types'

// Additive columns added after the tables were created. Each runs once:
// it checks the live table first, so restarts are no-ops.
const COLUMNS: { table: string; column: string; ddl: string }[] = [
  { table: 'proofs', column: 'reject_reason', ddl: 'ALTER TABLE proofs ADD COLUMN reject_reason text' },
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
}
