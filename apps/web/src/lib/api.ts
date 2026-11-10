const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface RequestOptions {
  token?: string | null
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  json?: unknown
  body?: BodyInit
  headers?: Record<string, string>
}

// Whether Quest's own server is answering. The banner reads this so a dead
// server looks different from a dead connection.
let serverDown = false
const serverListeners = new Set<() => void>()

function setServerDown(next: boolean) {
  if (serverDown === next) return
  serverDown = next
  serverListeners.forEach((listener) => listener())
}

export const isServerDown = () => serverDown

export function onServerChange(listener: () => void) {
  serverListeners.add(listener)
  return () => {
    serverListeners.delete(listener)
  }
}

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { ...opts.headers }
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`

  let body = opts.body
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.json)
  }

  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? (body ? 'POST' : 'GET'),
      headers,
      body,
    })
  } catch (err) {
    // Online but no answer at all: the server is the problem, not the phone.
    if (typeof navigator !== 'undefined' && navigator.onLine) setServerDown(true)
    throw err
  }
  // 502–504 come from the host when the app behind it is down or restarting.
  setServerDown(res.status >= 502 && res.status <= 504)

  if (res.status === 204) return undefined as T

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const fallback =
      res.status === 401
        ? 'Your session ran out. Sign in again.'
        : res.status === 404
          ? 'We couldn’t find that. It may have been removed.'
          : res.status >= 500
            ? 'Quest had a problem on its end. Try again in a moment.'
            : 'That didn’t work. Try again.'
    throw new ApiError(res.status, data?.error ?? fallback)
  }
  return data as T
}

export function errorMessage(err: unknown): string {
  if (err instanceof TypeError) return 'Couldn’t reach Quest. Check your connection and try again.'
  if (err instanceof ApiError || err instanceof Error) return err.message
  return 'Something went wrong. Try again.'
}
