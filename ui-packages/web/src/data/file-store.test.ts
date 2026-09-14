import { describe, expect, it, vi } from 'vitest'
import { maximumFileBytes } from '../core/files'
import {
  closeFileStore,
  getStoredFile,
  getStoredFileContent,
  importStoredFiles,
  listStoredFiles,
  removeStoredFile,
  writeStoredTextFile,
} from './file-store'

const textFile = (name: string, content: string) =>
  new File([content], name, { type: 'text/markdown', lastModified: 1 })

const onlyAddedId = (result: Awaited<ReturnType<typeof importStoredFiles>>) => {
  const id = result.addedIds[0]
  if (!id) throw new Error('Expected one added file')
  return id
}

const fileWithReportedSize = (name: string, size: number) => {
  const file = new File(['content'], name, { type: 'application/octet-stream' })
  Object.defineProperty(file, 'size', { configurable: true, value: size })
  return file
}

describe('local file store', () => {
  it('migrates version-one metadata into the files collection', async () => {
    await closeFileStore()
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('gamma-reader-files', 1)
      request.onupgradeneeded = () => {
        const files = request.result.createObjectStore('files', { keyPath: 'id' })
        files.createIndex('by-created-at', 'createdAt')
        const contents = request.result.createObjectStore('contents', { keyPath: 'id' })
        files.put({
          id: 'legacy',
          name: 'Legacy.md',
          mediaType: 'text/markdown',
          previewKind: 'markdown',
          size: 6,
          lastModified: 1,
          createdAt: 1,
          revision: 1,
        })
        contents.put({ id: 'legacy', blob: new Blob(['legacy'], { type: 'text/markdown' }) })
      }
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
      request.onerror = () => reject(request.error)
    })

    expect(await listStoredFiles()).toEqual([
      expect.objectContaining({ id: 'legacy', collection: 'files' }),
    ])
    expect(await (await getStoredFileContent('legacy'))?.text()).toBe('legacy')
  })

  it('adds conversation stores to version two without changing stored files', async () => {
    await closeFileStore()
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('gamma-reader-files', 2)
      request.onupgradeneeded = () => {
        const files = request.result.createObjectStore('files', { keyPath: 'id' })
        files.createIndex('by-created-at', 'createdAt')
        const contents = request.result.createObjectStore('contents', { keyPath: 'id' })
        files.put({
          id: 'version-two',
          name: 'Version two.md',
          collection: 'files',
          mediaType: 'text/markdown',
          previewKind: 'markdown',
          size: 3,
          lastModified: 1,
          createdAt: 1,
          revision: 1,
        })
        contents.put({ id: 'version-two', blob: new Blob(['old'], { type: 'text/markdown' }) })
      }
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
      request.onerror = () => reject(request.error)
    })

    expect(await listStoredFiles()).toEqual([
      expect.objectContaining({ id: 'version-two', name: 'Version two.md' }),
    ])
    expect(await (await getStoredFileContent('version-two'))?.text()).toBe('old')
  })

  it('can retry after opening IndexedDB fails', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
      throw new DOMException('Temporarily unavailable', 'UnknownError')
    })

    await expect(listStoredFiles()).rejects.toThrow('Temporarily unavailable')
    await expect(listStoredFiles()).resolves.toHaveLength(4)
  })

  it('seeds samples once and keeps a deleted sample removed after reopening', async () => {
    const initial = await listStoredFiles()
    expect(initial).toEqual([
      expect.objectContaining({
        id: 'getting-started',
        name: 'Getting started.md',
        previewKind: 'markdown',
      }),
      expect.objectContaining({
        id: 'how-gamma-reader-works',
        name: 'How Gamma Reader works.svg',
        previewKind: 'image',
      }),
      expect.objectContaining({
        id: 'art-of-noticing',
        name: 'The art of noticing.pdf',
        previewKind: 'pdf',
      }),
      expect.objectContaining({
        id: 'reading-notes',
        name: 'Reading notes.md',
        previewKind: 'markdown',
      }),
    ])
    expect((await getStoredFileContent('art-of-noticing'))?.type).toBe('application/pdf')

    await removeStoredFile('getting-started')
    await closeFileStore()

    expect((await listStoredFiles()).map(file => file.id)).not.toContain('getting-started')
    expect(await getStoredFileContent('getting-started')).toBeNull()
  })

  it('replaces a duplicate in place or keeps it under a numbered name', async () => {
    const added = await importStoredFiles([textFile('Draft.md', 'first')], 'keep')
    expect(added.addedIds).toHaveLength(1)
    const id = onlyAddedId(added)

    const replaced = await importStoredFiles([textFile('Draft.md', 'second')], 'replace')
    expect(replaced).toMatchObject({ addedIds: [], replacedIds: [id], rejected: [] })
    expect(await getStoredFileContent(id)).not.toBeNull()
    expect(await (await getStoredFileContent(id))?.text()).toBe('second')

    const kept = await importStoredFiles([textFile('Draft.md', 'third')], 'keep')
    expect(kept.addedIds).toHaveLength(1)
    const keptId = onlyAddedId(kept)
    const files = await listStoredFiles()
    expect(files.find(file => file.id === id)).toMatchObject({ name: 'Draft.md', revision: 2 })
    expect(files.find(file => file.id === keptId)?.name).toBe('Draft (2).md')
  })

  it('writes generated text through the same limits and replacement model', async () => {
    const first = await writeStoredTextFile('Generated.json', '{"value":"初稿"}')
    expect(first).toMatchObject({
      name: 'Generated.json',
      collection: 'files',
      previewKind: 'text',
      revision: 1,
    })
    expect(first.size).toBe(new TextEncoder().encode('{"value":"初稿"}').byteLength)

    const second = await writeStoredTextFile('generated.JSON', '{"value":"final"}')
    expect(second).toMatchObject({ id: first.id, revision: 2, createdAt: first.createdAt })
    expect(await (await getStoredFileContent(first.id))?.text()).toBe('{"value":"final"}')

    const controller = new AbortController()
    controller.abort()
    await expect(
      writeStoredTextFile('Cancelled.txt', 'not written', controller.signal),
    ).rejects.toThrow()
    expect((await listStoredFiles()).some(file => file.name === 'Cancelled.txt')).toBe(false)
  })

  it('stores generated SVG as an image and repairs legacy SVG Blob types when reading', async () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4" /></svg>'
    const generated = await writeStoredTextFile('Generated.svg', source)

    expect(generated).toMatchObject({ mediaType: 'image/svg+xml', previewKind: 'image' })
    expect((await getStoredFileContent(generated.id))?.type).toBe('image/svg+xml')

    const legacy = await importStoredFiles(
      [new File([source], 'Legacy.svg', { type: 'text/plain;charset=utf-8' })],
      'keep',
    )
    const legacyId = onlyAddedId(legacy)
    expect(legacy.imported[0]?.metadata.mediaType).toBe('text/plain;charset=utf-8')
    expect((await getStoredFileContent(legacyId))?.type).toBe('image/svg+xml')
    expect((await getStoredFile(legacyId))?.blob.type).toBe('image/svg+xml')
  })

  it('stores only the last copy when a selected batch repeats a new name', async () => {
    const result = await importStoredFiles(
      [textFile('Repeated.md', 'first'), textFile('Repeated.md', 'last')],
      'replace',
    )

    expect(result.addedIds).toHaveLength(1)
    expect(result.replacedIds).toEqual([])
    expect((await listStoredFiles()).filter(file => file.name === 'Repeated.md')).toHaveLength(1)
    expect(await (await getStoredFileContent(onlyAddedId(result)))?.text()).toBe('last')
  })

  it('recognizes common UTF-8 document formats with application MIME types as text', async () => {
    await importStoredFiles(
      [new File(['{"local":true}'], 'Context.json', { type: 'application/json' })],
      'keep',
    )

    expect((await listStoredFiles()).find(file => file.name === 'Context.json')?.previewKind).toBe(
      'text',
    )
  })

  it('stores chat attachments in the shared workspace with source mappings', async () => {
    const result = await importStoredFiles(
      [textFile('Chat notes.md', 'private attachment content')],
      'keep',
      'attachments',
    )

    expect(result.imported).toHaveLength(1)
    expect(result.imported[0]).toMatchObject({
      sourceIndex: 0,
      action: 'added',
      metadata: { name: 'Chat notes.md', collection: 'attachments' },
    })
    expect((await listStoredFiles()).find(file => file.name === 'Chat notes.md')).toMatchObject({
      collection: 'attachments',
    })
    expect(await (await getStoredFileContent(result.imported[0]?.metadata.id ?? ''))?.text()).toBe(
      'private attachment content',
    )
  })

  it('rejects files over 50 MB and additions beyond the 500 MB library limit', async () => {
    const tooLarge = await importStoredFiles(
      [fileWithReportedSize('too-large.bin', maximumFileBytes + 1)],
      'keep',
    )
    expect(tooLarge.rejected).toEqual([
      { sourceIndex: 0, name: 'too-large.bin', reason: 'file-too-large' },
    ])

    const firstBatch = Array.from({ length: 9 }, (_, index) =>
      fileWithReportedSize(`large-${index}.bin`, maximumFileBytes),
    )
    expect((await importStoredFiles(firstBatch, 'keep')).addedIds).toHaveLength(9)

    const libraryFull = await importStoredFiles(
      [fileWithReportedSize('one-more.bin', maximumFileBytes)],
      'keep',
    )
    expect(libraryFull.rejected).toEqual([
      { sourceIndex: 0, name: 'one-more.bin', reason: 'library-full' },
    ])
  })
})
