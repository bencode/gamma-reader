import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadFile } from './remote-files'

afterEach(() => vi.restoreAllMocks())

const pageUrl = 'https://books.example/full-text/book/page.html'
const page = `<!doctype html><html><body><img src="figure.gif"><img src="missing.gif"></body></html>`

// A response from a site that allows cross-origin reads, carrying the address it came from.
const served = (body: BodyInit, type: string, url: string) => {
  const response = new Response(body, { headers: { 'Content-Type': type } })
  Object.defineProperty(response, 'url', { value: url })
  return response
}

const sources = async (file: File) =>
  [...new DOMParser().parseFromString(await file.text(), 'text/html').images].map(image =>
    image.getAttribute('src'),
  )

describe('downloadFile', () => {
  it('carries the images of a web page inside it, keeping the address of one it cannot fetch', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fetchFile = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = String(input)
      if (url === pageUrl) return served(page, 'text/html', url)
      if (url.endsWith('figure.gif')) return served(new Blob(['GIF89a']), 'image/gif', url)
      return new Response('', { status: 404 })
    })

    const file = await downloadFile({ kind: 'file', url: pageUrl, name: 'page.html' })

    expect(fetchFile).toHaveBeenCalledWith('https://books.example/full-text/book/figure.gif')
    expect(await sources(file)).toEqual([
      `data:image/gif;base64,${btoa('GIF89a')}`,
      'https://books.example/full-text/book/missing.gif',
    ])
  })
})
