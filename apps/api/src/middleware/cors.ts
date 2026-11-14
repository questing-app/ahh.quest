import { cors } from 'hono/cors'
import type { Env } from '../types'

const DEFAULT_ORIGINS = ['http://localhost:3000']

// ALLOWED_ORIGINS is a comma-separated list set in wrangler.toml [vars].
export const corsMiddleware = cors({
  origin: (origin, c) => {
    const env = c.env as Env
    const allowed = env.ALLOWED_ORIGINS
      ? env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
      : DEFAULT_ORIGINS
    return allowed.includes(origin) ? origin : null
  },
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  // solana-client is sent by @solana/web3.js on every RPC call to /rpc.
  allowHeaders: ['Authorization', 'Content-Type', 'x-claim-id', 'x-frame-index', 'solana-client'],
  maxAge: 86400,
})
