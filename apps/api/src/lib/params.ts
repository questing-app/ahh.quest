import type { Context } from 'hono'
import { BadRequest } from './errors'

// Hono loses path-param inference when a route has inline middleware,
// so c.req.param() comes back as string | undefined.
export function pathParam(c: Context, name: string): string {
  const value = c.req.param(name)
  if (!value) throw new BadRequest(`Missing ${name}`)
  return value
}
