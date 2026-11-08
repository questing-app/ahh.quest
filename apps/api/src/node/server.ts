// Runs the API on Node (Railway) instead of Cloudflare Workers.
// Config comes from process.env; bindings are swapped for local stand-ins.
import { serve } from '@hono/node-server'
import { app } from '../index'
import { processVerificationJob } from '../services/verification.service'
import { runCrank } from '../cron/crank'
import type { Env, VerificationMessage } from '../types'
import { FsBucket, LocalQueue, MemoryKV } from './bindings'

const CRANK_INTERVAL_MS = 5 * 60_000

const env = { ...process.env } as unknown as Env
env.R2 = new FsBucket(process.env.MEDIA_DIR ?? './.media') as unknown as R2Bucket
env.RATE_LIMIT_KV = new MemoryKV() as unknown as KVNamespace
env.VERIFICATION_QUEUE = new LocalQueue<VerificationMessage>((msg) =>
  processVerificationJob(env, msg.proofId),
) as unknown as Queue

const port = Number(process.env.PORT ?? 8787)
// Test hook mirroring `wrangler dev --test-scheduled`; only the e2e script sets it.
const testScheduled = process.env.ENABLE_TEST_SCHEDULED === '1'

serve({
  fetch: async (req) => {
    if (testScheduled && new URL(req.url).pathname === '/__scheduled') {
      await runCrank(env)
      return new Response('ran crank')
    }
    return app.fetch(req, env)
  },
  port,
}, () => {
  console.log(`quest-api listening on :${port}`)
})

let cranking = false
setInterval(async () => {
  if (cranking) return
  cranking = true
  try {
    await runCrank(env)
  } catch (err) {
    console.error('Crank failed:', err)
  } finally {
    cranking = false
  }
}, CRANK_INTERVAL_MS)
