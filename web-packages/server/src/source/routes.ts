import { Hono } from 'hono'
import type { Source } from './repository.js'

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

export const createRoutes = (source: Source) => {
  const app = new Hono()
  app.get('/', async c => {
    c.header('Cache-Control', 'no-store')
    return c.json(await source.listing())
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
