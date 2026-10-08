import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StoredFileMetadata } from '../../core/files'
import { FileExistsError } from '../../data/file-store'
import { createUrlTools, type WebState } from './url-tools'

afterEach(() => vi.restoreAllMocks())

const saved: { path: string; file: File }[] = []
const save = async (path: string, file: File) => {
  if (saved.some(entry => entry.path === path))
    throw new FileExistsError(`A file already exists at ${path}. Choose another path.`)
  saved.push({ path, file })
  return { id: `id-${saved.length}`, path, mediaType: file.type } as StoredFileMetadata
}

const run = (input: { url: string; path?: string }, web: WebState) => {
  const [tool] = createUrlTools(save, () => web)
  if (!tool) throw new Error('save_from_url is missing')
  return tool.execute('call', input, new AbortController().signal)
}
const result = (output: Awaited<ReturnType<typeof run>>) =>
  JSON.parse((output.content[0] as { text: string }).text)

// The browser refuses a cross-origin read with a bare TypeError.
const blockedSite = () => Promise.reject(new TypeError('Failed to fetch'))

describe('save_from_url', () => {
  afterEach(() => {
    saved.length = 0
  })

  it('saves a file the browser can download as it is, without web search', async () => {
    const fetchFile = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async () =>
          new Response(new Blob(['%PDF']), { headers: { 'Content-Type': 'application/pdf' } }),
      )

    const output = result(await run({ url: 'https://arxiv.org/abs/1706.03762' }, 'off'))

    expect(fetchFile.mock.calls[0]?.[0]).toBe('https://arxiv.org/pdf/1706.03762')
    expect(output).toEqual({
      fileId: 'id-1',
      path: '1706.03762.pdf',
      saved: 'file',
      mediaType: 'application/pdf',
    })
    await expect(run({ url: 'https://arxiv.org/abs/1706.03762' }, 'off')).rejects.toThrow(
      'A file already exists at 1706.03762.pdf',
    )
  })

  it('says how to save a page the browser may not download', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(blockedSite)

    await expect(run({ url: 'https://example.org/post' }, 'off')).rejects.toThrow(
      'With web search on, the page text can be saved as Markdown',
    )
    await expect(run({ url: 'https://example.org/post' }, 'unavailable')).rejects.toThrow(
      'Download the file and drag it into Files',
    )
    expect(saved).toEqual([])
  })

  it('saves the text of a page as Markdown with its source while web search is on', async () => {
    const fetchPage = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async url =>
        url === '/api/agent/extract'
          ? Response.json({ url: 'https://example.org/post', content: '# Least action\n\nText' })
          : blockedSite(),
      )

    const output = result(await run({ url: 'https://example.org/post' }, 'on'))

    expect(JSON.parse(String(fetchPage.mock.calls[1]?.[1]?.body))).toEqual({
      url: 'https://example.org/post',
    })
    expect(output).toMatchObject({ path: 'Least action.md', saved: 'page-text' })
    expect(await saved[0]?.file.text()).toMatch(
      /^> Saved from <https:\/\/example\.org\/post> on \d{4}-\d{2}-\d{2}\.\n\n# Least action\n\nText$/,
    )
  })

  it('keeps a readable page as HTML while its text cannot be extracted', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<h1>Notes</h1>', { headers: { 'Content-Type': 'text/html' } }),
    )

    expect(result(await run({ url: 'https://example.org/notes' }, 'off'))).toMatchObject({
      path: 'notes.html',
      saved: 'file',
    })
  })

  it('reports what the site said, and refuses addresses it cannot save', async () => {
    const fetchMissing = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('', { status: 404 }))

    await expect(run({ url: 'https://example.org/gone' }, 'on')).rejects.toThrow(
      'Nothing was found at that address.',
    )
    expect(fetchMissing).toHaveBeenCalledTimes(1)
    await expect(run({ url: 'https://github.com/lesscap/brain2' }, 'on')).rejects.toThrow(
      'GitHub folder',
    )
    await expect(run({ url: 'ftp://example.org/a' }, 'on')).rejects.toThrow('http or https')
  })
})
