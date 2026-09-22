import { describe, expect, it, vi } from 'vitest'
import type { FileCollection } from '../core/files'
import { samples } from '../core/samples'
import {
  closeFileStore,
  getStoredFile,
  getStoredFileContent,
  importStoredFiles,
  listStoredFiles,
  removeStoredFile,
  updateStoredTextFile,
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
    await expect(listStoredFiles()).resolves.toHaveLength(samples.length)
  })

  it('seeds samples once and keeps a deleted sample removed after reopening', async () => {
    const initial = await listStoredFiles()
    // The order is the tour Start here.md walks a first-time reader through.
    expect(initial).toEqual([
      expect.objectContaining({
        id: 'getting-started',
        name: 'Start here.md',
        previewKind: 'markdown',
      }),
      expect.objectContaining({
        id: 'art-of-noticing',
        name: 'The art of noticing.pdf',
        previewKind: 'pdf',
      }),
      expect.objectContaining({
        id: 'field-notes',
        name: 'Field notes.docx',
        previewKind: 'docx',
      }),
      expect.objectContaining({
        id: 'observation-log',
        name: 'Observation log.xlsx',
        previewKind: 'xlsx',
      }),
      expect.objectContaining({
        id: 'explore-wave',
        name: 'Explore a wave.lab.md',
        previewKind: 'markdown',
      }),
      expect.objectContaining({
        id: 'seven-mornings',
        name: 'Seven mornings.lab.md',
        previewKind: 'markdown',
      }),
      expect.objectContaining({
        id: 'orbit-demo',
        name: 'Orbit.p5.js',
        previewKind: 'text',
      }),
      expect.objectContaining({
        id: 'how-gamma-reader-works',
        name: 'How Gamma Reader works.svg',
        previewKind: 'image',
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

  it.each<FileCollection>(['files', 'attachments'])(
    'accepts 200 MiB in %s and preserves the file when an oversized replacement is rejected',
    async collection => {
      const size = 200 * 1024 * 1024
      const result = await importStoredFiles(
        [fileWithReportedSize('large.pdf', size)],
        'keep',
        collection,
      )
      const id = onlyAddedId(result)
      const before = await getStoredFile(id)
      const rejected = await importStoredFiles(
        [fileWithReportedSize('large.pdf', size + 1)],
        'replace',
        collection,
      )
      expect(rejected.rejected).toEqual([
        { sourceIndex: 0, name: 'large.pdf', reason: 'file-too-large' },
      ])
      expect((await getStoredFile(id))?.metadata).toEqual(before?.metadata)
      expect(await (await getStoredFileContent(id))?.text()).toBe('content')
    },
  )

  it('shares the 1 GiB limit with attachments and charges only replacement growth', async () => {
    const seedBytes = (await listStoredFiles()).reduce((total, file) => total + file.size, 0)
    const size = 200 * 1024 * 1024
    const files = Array.from({ length: 5 }, (_, index) =>
      fileWithReportedSize(`large-${index}.bin`, size),
    )
    expect((await importStoredFiles(files, 'keep')).addedIds).toHaveLength(5)
    const remaining = 1024 * 1024 * 1024 - seedBytes - 5 * size
    const tail = fileWithReportedSize('tail.bin', remaining)
    const id = onlyAddedId(await importStoredFiles([tail], 'keep', 'attachments'))
    const overflow = await importStoredFiles([fileWithReportedSize('extra.bin', 1)], 'keep')
    expect(overflow.rejected[0]?.reason).toBe('library-full')
    const rejected = await importStoredFiles(
      [fileWithReportedSize('tail.bin', remaining + 1)],
      'replace',
      'attachments',
    )
    expect(rejected.rejected[0]?.reason).toBe('library-full')
    expect((await getStoredFile(id))?.metadata.size).toBe(remaining)
    const replaced = await importStoredFiles([tail], 'replace', 'attachments')
    expect(replaced.imported[0]).toMatchObject({ action: 'replaced', metadata: { id } })
  })

  it('rejects an import when the browser quota is lower than the application limit', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'storage')
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { estimate: async () => ({ quota: 100, usage: 99 }) },
    })
    try {
      const result = await importStoredFiles([fileWithReportedSize('small.bin', 2)], 'keep')
      expect(result.rejected[0]?.reason).toBe('storage-unavailable')
      expect((await listStoredFiles()).some(file => file.name === 'small.bin')).toBe(false)
    } finally {
      if (descriptor) Object.defineProperty(navigator, 'storage', descriptor)
      else Reflect.deleteProperty(navigator, 'storage')
    }
  })
})

describe('source save revision checks', () => {
  it('commits one competing revision and rejects the other without losing the winner', async () => {
    const file = await writeStoredTextFile('Save.md', 'original')
    const results = await Promise.all([
      updateStoredTextFile(file.id, file.revision, 'first'),
      updateStoredTextFile(file.id, file.revision, 'second'),
    ])
    expect(results.filter(result => result.status === 'saved')).toHaveLength(1)
    expect(results.filter(result => result.status === 'conflict')).toHaveLength(1)
    const saved = await getStoredFile(file.id)
    expect(saved?.metadata.revision).toBe(file.revision + 1)
    expect(await saved?.blob.text()).toBe(results[0]?.status === 'saved' ? 'first' : 'second')
    await removeStoredFile(file.id)
    expect(await updateStoredTextFile(file.id, file.revision + 1, 'late')).toEqual({
      status: 'missing',
    })
    expect(await getStoredFile(file.id)).toBeNull()
  })
})
