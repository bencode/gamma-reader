import { describe, expect, it, vi } from 'vitest'
import {
  importStoredFiles,
  listStoredFiles,
  removeStoredFile,
  writeStoredTextFile,
} from '../data/file-store'
import type { ListInput, ReadInput, SearchInput, SearchMatch } from './local-tool-types'
import { createLocalTools } from './local-tools'

const pdf = vi.hoisted(() => ({
  pages: ['Opening context.\nA shared phrase.', 'Ending context.\nA shared phrase.'],
  close: vi.fn(),
  failPage: 0,
}))
vi.mock('./pdf-source', () => ({
  openPdfSource: async () => ({
    pageCount: pdf.pages.length,
    readPage: async (page: number) => {
      if (page === pdf.failPage) throw new Error('Damaged PDF page')
      return pdf.pages[page - 1] ?? ''
    },
    close: async () => {
      pdf.close()
    },
  }),
}))

const tools = createLocalTools(
  () => ({ openFiles: [], activeFile: null, viewport: null }),
  writeStoredTextFile,
)
const add = async (name: string, text: string, type = 'text/plain') => {
  const result = await importStoredFiles([new File([text], name, { type })], 'keep')
  const id = result.addedIds[0]
  if (!id) throw new Error('Fixture import failed')
  return id
}
const budget = (result: unknown) =>
  expect(new TextEncoder().encode(JSON.stringify(result)).length).toBeLessThanOrEqual(16 * 1024)

describe('local reader tools', () => {
  it('lists capabilities, filters names, and paginates without losing files', async () => {
    await importStoredFiles(
      Array.from(
        { length: 105 },
        (_, index) => new File(['text'], `Fixture ${index}.txt`, { type: 'text/plain' }),
      ),
      'keep',
    )
    await add('Fixture unsupported.html', '<p>text</p>', 'text/html')
    await importStoredFiles(
      [new File(['context'], 'Fixture attachment.txt', { type: 'text/plain' })],
      'keep',
      'attachments',
    )
    let next: ListInput | null = { name: 'FIXTURE' }
    const files = []
    while (next) {
      const result = await tools.list(next)
      budget(result)
      files.push(...result.files)
      next = result.next
    }
    expect(files).toHaveLength(107)
    expect(new Set(files.map(file => file.id)).size).toBe(107)
    expect(files.find(file => file.name === 'Fixture attachment.txt')).toMatchObject({
      collection: 'attachments',
      textReadable: true,
    })
    expect(files.find(file => file.type === 'html')).toMatchObject({
      textReadable: false,
      reason: expect.any(String),
    })
  })

  it('searches across files and returns directly readable, one-based ranges', async () => {
    const contents = Array.from(
      { length: 13 },
      (_, index) =>
        new File(
          [`# ${index}\n\nSearch **this phrase** here.\n\nSearch this phrase again.`],
          `Search ${index}.md`,
          { type: 'text/markdown' },
        ),
    )
    await importStoredFiles(contents, 'keep')
    let next: SearchInput | null = { query: 'SEARCH this\nphrase' }
    const matches: SearchMatch[] = []
    while (next) {
      const result = await tools.search(next)
      budget(result)
      matches.push(...result.matches)
      next = result.next
      expect(matches.length).toBeLessThanOrEqual(26)
    }
    expect(matches).toHaveLength(26)
    expect(new Set(matches.map(match => `${match.fileId}:${match.range.start}`)).size).toBe(26)
    for (const match of matches) {
      const result = await tools.read({ fileId: match.fileId, range: match.range })
      expect(result.content).toContain('Search this phrase')
      expect(result.next).toBeNull()
    }
  })

  it('reads the full range between two anchors and continues a long Unicode line exactly', async () => {
    const content = `开头\n${'阅读🙂'.repeat(10000)}\n结尾\nOutside the requested range`
    const id = await add('Long.txt', content)
    const first = (await tools.search({ fileId: id, query: '开头' })).matches[0]
    const last = (await tools.search({ fileId: id, query: '结尾' })).matches[0]
    if (!first || !last) throw new Error('Anchors missing')
    let next: ReadInput | null = {
      fileId: id,
      range: { unit: 'line', start: first.range.start, end: last.range.end },
    }
    let read = ''
    let calls = 0
    while (next) {
      const result = await tools.read(next)
      budget(result)
      expect(result.content).not.toContain('\uFFFD')
      read += result.content
      next = result.next
      expect(++calls).toBeLessThan(40)
    }
    expect(read).toBe(content.split('\n').slice(0, 3).join('\n'))
    expect(calls).toBeGreaterThan(1)
  })

  it('rejects changed, deleted and mismatched continuations', async () => {
    const id = await add('Changing.txt', 'line\n'.repeat(500))
    const result = await tools.read({ fileId: id })
    if (!result.next) throw new Error('Expected continuation')
    await expect(
      tools.read({ ...result.next, range: { unit: 'line', start: 2, end: 3 } }),
    ).rejects.toThrow('does not match')
    await importStoredFiles(
      [new File(['new content'], 'Changing.txt', { type: 'text/plain' })],
      'replace',
    )
    await expect(tools.read(result.next)).rejects.toThrow('File changed')
    await removeStoredFile(id)
    await expect(tools.read(result.next)).rejects.toThrow('removed')
    await expect(tools.search({ query: ' ', fileId: id })).rejects.toThrow('Query must contain')
    await expect(tools.list({ cursor: 'not a cursor' })).rejects.toThrow('Invalid cursor')
  })

  it('reports unreadable files separately and bounds pages of errors', async () => {
    await importStoredFiles(
      Array.from(
        { length: 130 },
        (_, index) =>
          new File(['<p>Unreadable fixture</p>'], `Unreadable ${index}.html`, {
            type: 'text/html',
          }),
      ),
      'keep',
    )
    const id = await add('Valid.txt', 'Unique search fixture')
    let next: SearchInput | null = { query: 'Unique search fixture' }
    let issueCount = 0
    const ids: string[] = []
    while (next) {
      const result = await tools.search(next)
      budget(result)
      issueCount += result.issues.length
      ids.push(...result.matches.map(match => match.fileId))
      next = result.next
      expect(issueCount).toBeLessThanOrEqual(131)
    }
    expect(issueCount).toBe(131)
    expect(ids).toEqual([id])
    const bad = await importStoredFiles(
      [new File([new Uint8Array([255])], 'Broken.txt', { type: 'text/plain' })],
      'keep',
    )
    await expect(tools.read({ fileId: bad.addedIds[0] ?? '' })).rejects.toThrow('UTF-8')
  })

  it('uses PDF page ranges and releases resources on success and failure', async () => {
    pdf.failPage = 0
    const id = await add('Pages.pdf', 'PDF fixture', 'application/pdf')
    const result = await tools.search({ fileId: id, query: 'shared phrase' })
    expect(result.matches.map(match => match.range)).toEqual([
      { unit: 'page', start: 1, end: 1 },
      { unit: 'page', start: 2, end: 2 },
    ])
    const page = await tools.read({ fileId: id, range: { unit: 'page', start: 2, end: 2 } })
    expect(page.content).toContain('Ending context')
    expect(page.next).toBeNull()
    await expect(
      tools.read({ fileId: id, range: { unit: 'line', start: 1, end: 1 } }),
    ).rejects.toThrow('unit="page"')
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    pdf.close.mockClear()
    pdf.failPage = 2
    const failed = await tools.search({ fileId: id, query: 'shared phrase' })
    expect(failed.issues[0]?.reason).toBe('Damaged PDF page')
    expect(pdf.close).toHaveBeenCalledOnce()
    expect(report).toHaveBeenCalled()
    pdf.failPage = 0
  })

  it('does not access the network, handles empty files and honors cancellation', async () => {
    const network = vi.spyOn(globalThis, 'fetch')
    const id = await add('Empty.txt', '')
    expect(await tools.read({ fileId: id })).toMatchObject({
      content: '',
      next: null,
      notice: expect.any(String),
    })
    expect((await tools.search({ fileId: id, query: 'missing' })).issues).toHaveLength(1)
    await expect(
      tools.read({ fileId: id, range: { unit: 'line', start: 0, end: 1 } }),
    ).rejects.toThrow('one-based')
    const controller = new AbortController()
    controller.abort()
    await expect(tools.read({ fileId: id }, controller.signal)).rejects.toThrow()
    expect(network).not.toHaveBeenCalled()
    expect((await listStoredFiles()).some(file => file.id === id)).toBe(true)
  })

  it('keeps continuation inputs compact even when the original query contains excessive whitespace', async () => {
    const id = await add(
      'Whitespace.txt',
      Array.from({ length: 12 }, () => 'matching phrase').join('\n'),
    )
    const result = await tools.search({ fileId: id, query: `matching${' '.repeat(20000)}phrase` })
    budget(result)
    expect(result.next?.query).toBe('matching phrase')
    if (!result.next) throw new Error('Expected continuation')
    const remaining = await tools.search(result.next)
    expect(remaining.matches).toHaveLength(2)
    expect(remaining.next).toBeNull()
    await expect(tools.search({ fileId: '', query: 'matching' })).rejects.toThrow('not found')
  })
})
