// Node stand-ins for the Cloudflare bindings the API uses, so the same Hono app
// runs on Railway. They cover only the calls the code makes: R2 put/get/list,
// KV get/put with TTL, and Queue send.
import { createReadStream } from 'node:fs'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { Readable } from 'node:stream'

type Range = { offset: number; length?: number }
type HttpMetadata = { contentType?: string }

class FsObject {
  constructor(
    readonly key: string,
    readonly size: number,
    readonly httpMetadata: HttpMetadata,
    private path: string,
    readonly range?: Range,
  ) {}

  get body(): ReadableStream {
    const start = this.range?.offset ?? 0
    const end = this.range?.length !== undefined ? start + this.range.length - 1 : undefined
    return Readable.toWeb(createReadStream(this.path, { start, end })) as ReadableStream
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    const buf = await readFile(this.path)
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  }

  async blob(): Promise<Blob> {
    return new Blob([await this.arrayBuffer()], { type: this.httpMetadata.contentType })
  }

  writeHttpMetadata(headers: Headers) {
    if (this.httpMetadata.contentType) headers.set('content-type', this.httpMetadata.contentType)
  }
}

/** R2-shaped bucket on the local filesystem (a Railway volume in production). */
export class FsBucket {
  private root: string

  constructor(root: string) {
    this.root = resolve(root)
  }

  private pathFor(key: string): string {
    const path = resolve(this.root, key)
    if (!path.startsWith(this.root + '/')) throw new Error(`Invalid key: ${key}`)
    return path
  }

  async put(
    key: string,
    body: ReadableStream | ArrayBuffer | ArrayBufferView | string,
    options?: { httpMetadata?: HttpMetadata },
  ) {
    const path = this.pathFor(key)
    await mkdir(dirname(path), { recursive: true })
    const data =
      body instanceof ReadableStream
        ? Buffer.from(await new Response(body).arrayBuffer())
        : typeof body === 'string'
          ? Buffer.from(body)
          : ArrayBuffer.isView(body)
            ? Buffer.from(body.buffer, body.byteOffset, body.byteLength)
            : Buffer.from(body)
    await writeFile(path, data)
    await writeFile(`${path}.meta.json`, JSON.stringify(options?.httpMetadata ?? {}))
    return { key, size: data.byteLength }
  }

  async get(key: string, options?: { range?: Range }): Promise<FsObject | null> {
    const path = this.pathFor(key)
    try {
      const { size } = await stat(path)
      let meta: HttpMetadata = {}
      try {
        meta = JSON.parse(await readFile(`${path}.meta.json`, 'utf8'))
      } catch {}
      return new FsObject(key, size, meta, path, options?.range)
    } catch {
      return null
    }
  }

  async list(options?: { prefix?: string }) {
    const prefix = options?.prefix ?? ''
    const dir = this.pathFor(prefix.endsWith('/') ? prefix + '.' : prefix).replace(/\/\.$/, '')
    const objects: { key: string }[] = []
    const walk = async (d: string) => {
      let entries
      try {
        entries = await readdir(d, { withFileTypes: true })
      } catch {
        return
      }
      for (const e of entries) {
        const full = join(d, e.name)
        if (e.isDirectory()) await walk(full)
        else if (!e.name.endsWith('.meta.json')) {
          const key = relative(this.root, full)
          if (key.startsWith(prefix)) objects.push({ key })
        }
      }
    }
    await walk(prefix.endsWith('/') ? dir : dirname(dir))
    objects.sort((a, b) => a.key.localeCompare(b.key))
    return { objects, truncated: false }
  }
}

/** KV-shaped in-memory store. Fine for one instance: it only holds rate limits. */
export class MemoryKV {
  private store = new Map<string, { value: string; expires?: number }>()

  async get(key: string): Promise<string | null> {
    const hit = this.store.get(key)
    if (!hit) return null
    if (hit.expires && hit.expires < Date.now()) {
      this.store.delete(key)
      return null
    }
    return hit.value
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }) {
    this.store.set(key, {
      value,
      expires: options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : undefined,
    })
  }
}

/** Queue-shaped: runs each message in-process, retrying like the Worker consumer did. */
export class LocalQueue<T> {
  constructor(
    private handle: (body: T) => Promise<void>,
    private maxRetries = 2,
  ) {}

  async send(body: T) {
    const run = async (attempt: number) => {
      try {
        await this.handle(body)
      } catch (err) {
        console.error(`Queue job failed (attempt ${attempt + 1}):`, err)
        if (attempt < this.maxRetries) setTimeout(() => run(attempt + 1), 5_000 * (attempt + 1))
      }
    }
    setImmediate(() => run(0))
  }
}
