import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadPage } from './page-import'

afterEach(() => vi.restoreAllMocks())

const pageUrl = 'https://books.example/book/page.html'
const target = { kind: 'file', url: pageUrl, name: 'page.html' } as const

// A reply from a site that allows cross-origin reads, carrying the address it came from.
const served = (body: BodyInit, type: string, url: string) => {
  const response = new Response(body, { headers: { 'Content-Type': type } })
  Object.defineProperty(response, 'url', { value: url })
  return response
}

const serve = (routes: Record<string, () => Response>) =>
  vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(
      async input => routes[String(input)]?.() ?? new Response('', { status: 404 }),
    )

const image = (body: string, type: string) => () => served(new Blob([body]), type, '')

describe('downloadPage', () => {
  it('brings a page in as a folder, with its images saved under images/', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const page = `<!doctype html><body>
      <img src="fig.gif"><img src="../shared/fig.gif"><img src="https://cdn.example/logo">
      <img src="fig.gif" srcset="fig@2x.gif 2x"><img src="missing.gif"></body>`
    serve({
      [pageUrl]: () => served(page, 'text/html', pageUrl),
      'https://books.example/book/fig.gif': image('book/fig', 'image/gif'),
      'https://books.example/shared/fig.gif': image('shared/fig', 'image/gif'),
      'https://cdn.example/logo': image('logo', 'image/png'),
    })

    const sources = await downloadPage(target, () => undefined)

    expect(sources.map(source => source.path)).toEqual([
      'page/page.html',
      'page/images/fig.gif',
      'page/images/fig-2.gif',
      'page/images/logo.png',
    ])
    expect(await sources[2]?.file.text()).toBe('shared/fig')
    const saved = new DOMParser().parseFromString(
      (await sources[0]?.file.text()) ?? '',
      'text/html',
    )
    expect([...saved.images].map(img => img.getAttribute('src'))).toEqual([
      'images/fig.gif',
      'images/fig-2.gif',
      'images/logo.png',
      'images/fig.gif',
      'https://books.example/book/missing.gif',
    ])
    expect(saved.querySelector('[srcset]')).toBeNull()
  })

  it('keeps a page that is not UTF-8 as it was served', async () => {
    // "你好" in GBK, which is not valid UTF-8.
    const bytes = new Uint8Array([0xc4, 0xe3, 0xba, 0xc3])
    serve({ [pageUrl]: () => served(new Blob([bytes]), 'text/html', pageUrl) })

    const sources = await downloadPage(target, () => undefined)

    expect(sources.map(source => source.path)).toEqual(['page.html'])
    expect(new Uint8Array((await sources[0]?.file.arrayBuffer()) ?? new ArrayBuffer(0))).toEqual(
      bytes,
    )
  })
})
