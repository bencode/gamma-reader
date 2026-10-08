import 'fake-indexeddb/auto'
import { afterEach } from 'vitest'
import { deleteFileStore } from '../data/file-store'
import { deleteMemoryStore } from '../features/memory'

// The app fetches its own API by path; outside a page those paths need the backend's address,
// which the jsdom URL holds. The backend's pass cookie, which a browser keeps, is kept here.
const nativeFetch = globalThis.fetch
const cookies = new Map<string, string>()

globalThis.fetch = async (input, init) => {
  const url =
    typeof input === 'string' && input.startsWith('/') ? new URL(input, location.origin) : input
  const target = new URL(url instanceof Request ? url.url : String(url))
  const headers = new Headers(init?.headers)
  if (target.origin === location.origin && cookies.size)
    headers.set('Cookie', [...cookies].map(([name, value]) => `${name}=${value}`).join('; '))
  const response = await nativeFetch(url, { ...init, headers })
  response.headers.getSetCookie().forEach(cookie => {
    const [pair = ''] = cookie.split(';')
    const split = pair.indexOf('=')
    if (split > 0) cookies.set(pair.slice(0, split), pair.slice(split + 1))
  })
  return response
}

// One evaluation runs at a time, so the lock that keeps tabs apart is granted at once.
Object.defineProperty(navigator, 'locks', {
  configurable: true,
  value: {
    request: (_name: string, _options: unknown, run: (lock: object) => unknown) => run({}),
  },
})

afterEach(async () => {
  localStorage.clear()
  await deleteFileStore()
  await deleteMemoryStore()
})
