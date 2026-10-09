import { Hono } from 'hono'
import type { Author, Source } from './repository.js'
import type { SaveChange } from './save.js'

const contentTypes: Record<string, string> = {
  pdf: 'application/pdf',
  md: 'text/markdown; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  html: 'text/html; charset=utf-8',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
}

const contentType = (path: string) =>
  contentTypes[path.slice(path.lastIndexOf('.') + 1).toLowerCase()] ?? 'application/octet-stream'

// The path arrives as the reader wrote it, each segment encoded on its own; a broken escape
// names no file.
const filePath = (url: string) => {
  const { pathname } = new URL(url)
  const marker = '/files/'
  const encoded = pathname.slice(pathname.indexOf(marker) + marker.length)
  try {
    return encoded.split('/').map(decodeURIComponent).join('/')
  } catch (cause) {
    if (cause instanceof URIError) return null
    throw cause
  }
}

const isString = (value: unknown): value is string => typeof value === 'string'

const isSaveChange = (value: unknown): value is SaveChange => {
  if (typeof value !== 'object' || value === null || !('kind' in value)) return false
  const change = value as Record<string, unknown>
  if (change.kind === 'write')
    return (
      isString(change.path) &&
      isString(change.part) &&
      (change.base === null || isString(change.base))
    )
  if (change.kind === 'move') return isString(change.from) && isString(change.to)
  if (change.kind === 'delete') return isString(change.path) && isString(change.base)
  return false
}

// The changes arrive as one JSON list, each write's bytes in the part it names.
const readSave = async (request: Request) => {
  const form = await request.formData()
  const raw = form.get('changes')
  const changes: unknown = isString(raw) ? JSON.parse(raw) : null
  if (!Array.isArray(changes) || !changes.every(isSaveChange)) return null
  const content = async (part: string) => {
    const value = form.get(part)
    return value instanceof Blob ? new Uint8Array(await value.arrayBuffer()) : null
  }
  return { changes, content }
}

// Who saves, as the sign-in in front of the server names them; oauth2-proxy passes these
// headers. Angle brackets would end the name git records.
const authorOf = (request: Request): Author | null => {
  const header = (name: string) => request.headers.get(name)?.replace(/[<>]/g, '').trim() ?? ''
  const email = header('x-forwarded-email')
  return email ? { name: header('x-forwarded-user') || email, email } : null
}

export const createRoutes = (source: Source) => {
  const app = new Hono()
  app.get('/', async c => {
    c.header('Cache-Control', 'no-store')
    return c.json(await source.listing())
  })
  const save = source.save
  if (save)
    app.post('/save', async c => {
      const request = await readSave(c.req.raw).catch((cause: unknown) => {
        if (cause instanceof SyntaxError || cause instanceof TypeError) return null
        throw cause
      })
      if (!request) return c.json({ error: 'The changes could not be read.' }, 400)
      return c.json(await save(request.changes, request.content, authorOf(c.req.raw)))
    })
  app.get('/files/*', async c => {
    const path = filePath(c.req.url)
    const blob = path ? await source.blob(path) : null
    if (!blob) return c.json({ error: 'Not found' }, 404)
    return new Response(blob.stream, {
      headers: {
        'Content-Type': contentType(blob.file.path),
        'Content-Length': String(blob.file.size),
        'Cache-Control': 'no-store',
      },
    })
  })
  return app
}
