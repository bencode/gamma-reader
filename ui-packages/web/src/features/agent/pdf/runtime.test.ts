import type { PDFDocumentProxy } from 'pdfjs-dist'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getStoredFile, importStoredFiles, removeStoredFile } from '../../../data/file-store'
import { createPdfRuntime } from './runtime'

const mocks = vi.hoisted(() => ({ open: vi.fn() }))
vi.mock('./source', () => ({ openPdfSource: mocks.open }))
const outline = [
  { title: 'Chapter', dest: [0], items: [{ title: 'Details', dest: 'detail' }] },
  { title: 'External', url: 'https://example.com' },
]
const pdf = {
  numPages: 200,
  getMetadata: vi.fn(async () => ({ info: { Title: 'Sample', Author: 'Reader' } })),
  getOutline: vi.fn(async () => outline),
  getDestination: vi.fn(async () => [{ num: 7, gen: 0 }]),
  getPageIndex: vi.fn(async () => 9),
} as unknown as PDFDocumentProxy
const sources: {
  destroy: ReturnType<typeof vi.fn<() => Promise<void>>>
  renderPage: ReturnType<typeof vi.fn<() => Promise<Blob>>>
}[] = []

beforeEach(() => {
  sources.length = 0
  mocks.open.mockReset().mockImplementation(async () => {
    let destroyed = false
    const source = {
      pageCount: 200,
      readPage: async () => 'Page text',
      renderPage: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
      withDocument: async <T>(read: (document: PDFDocumentProxy) => Promise<T>) => read(pdf),
      destroy: vi.fn(async () => {
        destroyed = true
      }),
      get destroyed() {
        return destroyed
      },
    }
    sources.push(source)
    return source
  })
})
const addPdf = async (name = 'Book.pdf', mode: 'keep' | 'replace' = 'keep') => {
  const result = await importStoredFiles(
    [new File(['pdf'], name, { type: 'application/pdf' })],
    mode,
  )
  const file = result.imported[0]?.metadata
  if (!file) throw new Error('Missing PDF fixture')
  return file
}

describe('PDF runtime', () => {
  it('reopens the same revision after a cancelled operation closes its source', async () => {
    const file = await addPdf()
    const runtime = createPdfRuntime(getStoredFile)
    await runtime.info(file.id)
    const source = sources[0]
    if (!source) throw new Error('Missing PDF source')
    source.renderPage.mockImplementationOnce(async () => {
      await source.destroy()
      throw new Error('Cancelled by reader')
    })
    await expect(runtime.renderPage(file.id, 1)).rejects.toThrow('Cancelled by reader')
    await expect(runtime.info(file.id)).resolves.toMatchObject({ pageCount: 200 })
    await expect(runtime.renderPage(file.id, 1)).resolves.toBeInstanceOf(Blob)
    expect(mocks.open).toHaveBeenCalledTimes(2)
    await runtime.dispose()
  })

  it('reuses a revision across tools, reloads replacements, and refuses deleted files', async () => {
    const file = await addPdf()
    const runtime = createPdfRuntime(getStoredFile)
    expect(await runtime.info(file.id)).toEqual({
      fileId: file.id,
      pageCount: 200,
      title: 'Sample',
      author: 'Reader',
    })
    await runtime.renderPage(file.id, 1)
    expect(mocks.open).toHaveBeenCalledOnce()
    await addPdf('Book.pdf', 'replace')
    await runtime.info(file.id)
    expect(sources[0]?.destroy).toHaveBeenCalledOnce()
    expect(mocks.open).toHaveBeenCalledTimes(2)
    await removeStoredFile(file.id)
    await expect(runtime.info(file.id)).rejects.toThrow('removed')
    expect(sources[1]?.destroy).toHaveBeenCalledOnce()
    await runtime.dispose()
  })

  it('releases the previous document before opening another and on disposal', async () => {
    const first = await addPdf()
    const second = await addPdf('Other.pdf')
    const runtime = createPdfRuntime(getStoredFile)
    await runtime.info(first.id)
    mocks.open.mockImplementationOnce(async () => {
      expect(sources[0]?.destroy).toHaveBeenCalledOnce()
      throw new Error('Damaged PDF')
    })
    await expect(runtime.info(second.id)).rejects.toThrow('Damaged PDF')
    await runtime.info(first.id)
    await runtime.dispose()
    expect(sources[1]?.destroy).toHaveBeenCalledOnce()
  })

  it('resolves outline destinations without following external links and validates page numbers', async () => {
    const file = await addPdf()
    const runtime = createPdfRuntime(getStoredFile)
    expect((await runtime.outline({ fileId: file.id })).entries).toEqual([
      { title: 'Chapter', depth: 0, pageNumber: 1 },
      { title: 'Details', depth: 1, pageNumber: 10 },
      { title: 'External', depth: 0, pageNumber: null },
    ])
    await expect(runtime.renderPage(file.id, 201)).rejects.toThrow('between 1 and 200')
    expect(sources[0]?.renderPage).not.toHaveBeenCalled()
    await runtime.dispose()
  })

  it('paginates a large outline and rejects its cursor after replacement', async () => {
    vi.spyOn(pdf, 'getOutline').mockResolvedValue(
      Array.from({ length: 103 }, (_, index) => ({
        title: `Section ${index}`,
        dest: [index],
        items: [],
        bold: false,
        italic: false,
        color: new Uint8ClampedArray(3),
        url: '',
        unsafeUrl: '',
        newWindow: false,
        count: 0,
      })),
    )
    const file = await addPdf()
    const runtime = createPdfRuntime(getStoredFile)
    const first = await runtime.outline({ fileId: file.id })
    expect(first.entries).toHaveLength(100)
    if (!first.next) throw new Error('Expected continuation')
    const last = await runtime.outline(first.next)
    expect(last.entries).toHaveLength(3)
    expect(last.next).toBeNull()
    await addPdf('Book.pdf', 'replace')
    await expect(runtime.outline(first.next)).rejects.toThrow('File changed')
    await runtime.dispose()
  })
})
