import { describe, expect, it, vi } from 'vitest'
import { type FileCollection, rootSources } from '../core/files'
import { samples } from '../core/samples'
import {
  closeFileStore,
  getStoredFile,
  getStoredFileContent,
  importStoredFiles,
  listStoredFiles,
  moveStoredFile,
  removeStoredFiles,
  updateStoredTextFile,
  writeStoredTextFile,
} from './file-store'
import { getFolderExport } from './folder-export-store'

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
      expect.objectContaining({ id: 'legacy', path: 'Legacy.md', collection: 'files' }),
    ])
    expect((await listStoredFiles())[0]).not.toHaveProperty('name')
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
      expect.objectContaining({ id: 'version-two', path: 'Version two.md' }),
    ])
    expect(await (await getStoredFileContent('version-two'))?.text()).toBe('old')
  })

  it('places version-six files and saved export versions on paths', async () => {
    await closeFileStore()
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('gamma-reader-files', 6)
      request.onupgradeneeded = () => {
        const files = request.result.createObjectStore('files', { keyPath: 'id' })
        files.createIndex('by-created-at', 'createdAt')
        request.result.createObjectStore('contents', { keyPath: 'id' })
        request.result.createObjectStore('conversations', { keyPath: 'id' })
        request.result.createObjectStore('messages', { keyPath: ['conversationId', 'position'] })
        const exports = request.result.createObjectStore('folderExports', { keyPath: 'id' })
        files.put({
          id: 'version-six',
          name: 'Version six.md',
          collection: 'attachments',
          mediaType: 'text/markdown',
          previewKind: 'markdown',
          size: 3,
          lastModified: 1,
          createdAt: 1,
          revision: 4,
        })
        exports.put({
          id: 'files',
          directory: { kind: 'directory', name: 'Reading' },
          savedFiles: [{ id: 'version-six', name: 'Version six.md', revision: 4 }],
          savedAt: 1,
        })
      }
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
      request.onerror = () => reject(request.error)
    })

    const [file] = await listStoredFiles()
    expect(file).toEqual({
      id: 'version-six',
      path: 'Version six.md',
      collection: 'attachments',
      mediaType: 'text/markdown',
      previewKind: 'markdown',
      size: 3,
      lastModified: 1,
      createdAt: 1,
      revision: 4,
    })
    expect((await getFolderExport())?.savedFiles).toEqual([
      { id: 'version-six', path: 'Version six.md', revision: 4 },
    ])
  })

  it('reads source code stored before version eight as text', async () => {
    await closeFileStore()
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('gamma-reader-files', 7)
      request.onupgradeneeded = () => {
        const files = request.result.createObjectStore('files', { keyPath: 'id' })
        files.createIndex('by-created-at', 'createdAt')
        request.result.createObjectStore('contents', { keyPath: 'id' })
        request.result.createObjectStore('conversations', { keyPath: 'id' })
        request.result.createObjectStore('messages', { keyPath: ['conversationId', 'position'] })
        request.result.createObjectStore('folderExports', { keyPath: 'id' })
        files.put({
          id: 'script',
          path: 'tools/run.py',
          collection: 'files',
          mediaType: 'application/octet-stream',
          previewKind: 'unsupported',
          size: 3,
          lastModified: 1,
          createdAt: 1,
          revision: 1,
        })
      }
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
      request.onerror = () => reject(request.error)
    })

    expect(await listStoredFiles()).toEqual([
      expect.objectContaining({ id: 'script', path: 'tools/run.py', previewKind: 'text' }),
    ])
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
        path: 'Start here.md',
        previewKind: 'markdown',
      }),
      expect.objectContaining({
        id: 'art-of-noticing',
        path: 'The art of noticing.pdf',
        previewKind: 'pdf',
      }),
      expect.objectContaining({
        id: 'field-notes',
        path: 'Field notes.docx',
        previewKind: 'docx',
      }),
      expect.objectContaining({
        id: 'observation-log',
        path: 'Observation log.xlsx',
        previewKind: 'xlsx',
      }),
      expect.objectContaining({
        id: 'explore-wave',
        path: 'Explore a wave.lab.md',
        previewKind: 'markdown',
      }),
      expect.objectContaining({
        id: 'seven-mornings',
        path: 'Seven mornings.lab.md',
        previewKind: 'markdown',
      }),
      expect.objectContaining({
        id: 'orbit-demo',
        path: 'Orbit.p5.js',
        previewKind: 'text',
      }),
      expect.objectContaining({
        id: 'how-gamma-reader-works',
        path: 'How Gamma Reader works.svg',
        previewKind: 'image',
      }),
    ])
    expect((await getStoredFileContent('art-of-noticing'))?.type).toBe('application/pdf')

    await removeStoredFiles(['getting-started'])
    await closeFileStore()

    expect((await listStoredFiles()).map(file => file.id)).not.toContain('getting-started')
    expect(await getStoredFileContent('getting-started')).toBeNull()
  })

  it('replaces a duplicate in place or keeps it under a numbered name', async () => {
    const added = await importStoredFiles(rootSources([textFile('Draft.md', 'first')]), 'keep')
    expect(added.addedIds).toHaveLength(1)
    const id = onlyAddedId(added)

    const replaced = await importStoredFiles(
      rootSources([textFile('Draft.md', 'second')]),
      'replace',
    )
    expect(replaced).toMatchObject({ addedIds: [], replacedIds: [id], rejected: [] })
    expect(await getStoredFileContent(id)).not.toBeNull()
    expect(await (await getStoredFileContent(id))?.text()).toBe('second')

    const kept = await importStoredFiles(rootSources([textFile('Draft.md', 'third')]), 'keep')
    expect(kept.addedIds).toHaveLength(1)
    const keptId = onlyAddedId(kept)
    const files = await listStoredFiles()
    expect(files.find(file => file.id === id)).toMatchObject({ path: 'Draft.md', revision: 2 })
    expect(files.find(file => file.id === keptId)?.path).toBe('Draft (2).md')
  })

  it('writes generated text through the same limits and replacement model', async () => {
    const first = await writeStoredTextFile('Generated.json', '{"value":"初稿"}')
    expect(first).toMatchObject({
      path: 'Generated.json',
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
    expect((await listStoredFiles()).some(file => file.path === 'Cancelled.txt')).toBe(false)
  })

  it('stores generated SVG as an image and repairs legacy SVG Blob types when reading', async () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4" /></svg>'
    const generated = await writeStoredTextFile('Generated.svg', source)

    expect(generated).toMatchObject({ mediaType: 'image/svg+xml', previewKind: 'image' })
    expect((await getStoredFileContent(generated.id))?.type).toBe('image/svg+xml')

    const legacy = await importStoredFiles(
      rootSources([new File([source], 'Legacy.svg', { type: 'text/plain;charset=utf-8' })]),
      'keep',
    )
    const legacyId = onlyAddedId(legacy)
    expect(legacy.imported[0]?.metadata.mediaType).toBe('text/plain;charset=utf-8')
    expect((await getStoredFileContent(legacyId))?.type).toBe('image/svg+xml')
    expect((await getStoredFile(legacyId))?.blob.type).toBe('image/svg+xml')
  })

  it('stores only the last copy when a selected batch repeats a new name', async () => {
    const result = await importStoredFiles(
      rootSources([textFile('Repeated.md', 'first'), textFile('Repeated.md', 'last')]),
      'replace',
    )

    expect(result.addedIds).toHaveLength(1)
    expect(result.replacedIds).toEqual([])
    expect((await listStoredFiles()).filter(file => file.path === 'Repeated.md')).toHaveLength(1)
    expect(await (await getStoredFileContent(onlyAddedId(result)))?.text()).toBe('last')
  })

  it('stores files on folder paths and numbers a kept duplicate within its folder', async () => {
    const result = await importStoredFiles(
      [
        { path: 'docs/v1.2/Guide.md', file: textFile('Guide.md', 'first') },
        { path: 'docs/v1.2/Guide.md', file: textFile('Guide.md', 'second') },
      ],
      'keep',
    )

    expect(result.imported.map(item => item.metadata.path)).toEqual([
      'docs/v1.2/Guide.md',
      'docs/v1.2/Guide (2).md',
    ])
    const [first] = result.imported
    expect(await (await getStoredFileContent(first?.metadata.id ?? ''))?.text()).toBe('first')
  })

  it('rejects paths that are malformed or would put a file where a folder is', async () => {
    await importStoredFiles([{ path: 'docs/a.md', file: textFile('a.md', 'a') }], 'keep')

    const result = await importStoredFiles(
      ['docs', 'docs/a.md/b.md', '../a.md', '/a.md', 'a//b.md'].map(path => ({
        path,
        file: textFile('x.md', 'x'),
      })),
      'replace',
    )

    expect(result.imported).toEqual([])
    expect(result.rejected.map(item => [item.path, item.reason])).toEqual([
      ['docs', 'path-conflict'],
      ['docs/a.md/b.md', 'path-conflict'],
      ['../a.md', 'invalid-path'],
      ['/a.md', 'invalid-path'],
      ['a//b.md', 'invalid-path'],
    ])
    // Names a disk allows, such as one with a backslash, still import at the root.
    const kept = await importStoredFiles(rootSources([textFile('a\\b.md', 'kept')]), 'keep')
    expect(kept.imported[0]?.metadata.path).toBe('a\\b.md')
  })

  it('moves a file to a new path, keeping its id, revision and content', async () => {
    const [notes] = (
      await importStoredFiles(rootSources([textFile('Notes.txt', 'kept')]), 'keep')
    ).imported.map(item => item.metadata)
    if (!notes) throw new Error('Expected the notes file')

    const { from, metadata } = await moveStoredFile(notes.id, 'docs/notes.md')

    expect(from).toBe('Notes.txt')
    expect(metadata).toMatchObject({
      id: notes.id,
      path: 'docs/notes.md',
      revision: notes.revision,
      previewKind: 'markdown',
    })
    expect(await (await getStoredFileContent(notes.id))?.text()).toBe('kept')
    await expect(moveStoredFile(notes.id, 'docs/NOTES.md')).resolves.toMatchObject({
      metadata: { path: 'docs/NOTES.md' },
    })
  })

  it('refuses a move that would take another path, cross a folder or move an attachment', async () => {
    const imported = await importStoredFiles(
      [
        { path: 'a.md', file: textFile('a.md', 'a') },
        { path: 'docs/b.md', file: textFile('b.md', 'b') },
      ],
      'keep',
    )
    const [a] = imported.imported.map(item => item.metadata)
    const attachment = await importStoredFiles(
      rootSources([textFile('chat.md', 'c')]),
      'keep',
      'attachments',
    )
    if (!a) throw new Error('Expected a.md')
    const before = await listStoredFiles()

    for (const [id, path, reason] of [
      [a.id, 'DOCS/b.md', 'path-taken'],
      [a.id, 'docs', 'path-conflict'],
      [a.id, 'docs/b.md/a.md', 'path-conflict'],
      [a.id, '../a.md', 'invalid-path'],
      [attachment.addedIds[0] ?? '', 'docs/chat.md', 'attachment'],
      ['missing', 'x.md', 'missing'],
    ])
      await expect(moveStoredFile(id ?? '', path ?? '')).rejects.toMatchObject({ reason })
    expect(await listStoredFiles()).toEqual(before)
  })

  it('removes several files together and leaves the rest', async () => {
    const { imported } = await importStoredFiles(
      ['docs/a.md', 'docs/b.md', 'keep.md'].map(path => ({ path, file: textFile(path, path) })),
      'keep',
    )
    const [a, b, keep] = imported.map(item => item.metadata.id)

    await removeStoredFiles([a ?? '', b ?? ''])

    const paths = (await listStoredFiles()).map(file => file.path)
    expect(paths).toContain('keep.md')
    expect(paths.filter(path => path.startsWith('docs/'))).toEqual([])
    expect(await getStoredFileContent(a ?? '')).toBeNull()
    expect(await (await getStoredFileContent(keep ?? ''))?.text()).toBe('keep.md')
  })

  it('recognizes common UTF-8 document formats with application MIME types as text', async () => {
    await importStoredFiles(
      rootSources([new File(['{"local":true}'], 'Context.json', { type: 'application/json' })]),
      'keep',
    )

    expect((await listStoredFiles()).find(file => file.path === 'Context.json')?.previewKind).toBe(
      'text',
    )
  })

  it('stores chat attachments in the shared workspace with source mappings', async () => {
    const result = await importStoredFiles(
      rootSources([textFile('Chat notes.md', 'private attachment content')]),
      'keep',
      'attachments',
    )

    expect(result.imported).toHaveLength(1)
    expect(result.imported[0]).toMatchObject({
      sourceIndex: 0,
      action: 'added',
      metadata: { path: 'Chat notes.md', collection: 'attachments' },
    })
    expect((await listStoredFiles()).find(file => file.path === 'Chat notes.md')).toMatchObject({
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
        rootSources([fileWithReportedSize('large.pdf', size)]),
        'keep',
        collection,
      )
      const id = onlyAddedId(result)
      const before = await getStoredFile(id)
      const rejected = await importStoredFiles(
        rootSources([fileWithReportedSize('large.pdf', size + 1)]),
        'replace',
        collection,
      )
      expect(rejected.rejected).toEqual([
        { sourceIndex: 0, path: 'large.pdf', reason: 'file-too-large' },
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
    expect((await importStoredFiles(rootSources(files), 'keep')).addedIds).toHaveLength(5)
    const remaining = 1024 * 1024 * 1024 - seedBytes - 5 * size
    const tail = fileWithReportedSize('tail.bin', remaining)
    const id = onlyAddedId(await importStoredFiles(rootSources([tail]), 'keep', 'attachments'))
    const overflow = await importStoredFiles(
      rootSources([fileWithReportedSize('extra.bin', 1)]),
      'keep',
    )
    expect(overflow.rejected[0]?.reason).toBe('library-full')
    const rejected = await importStoredFiles(
      rootSources([fileWithReportedSize('tail.bin', remaining + 1)]),
      'replace',
      'attachments',
    )
    expect(rejected.rejected[0]?.reason).toBe('library-full')
    expect((await getStoredFile(id))?.metadata.size).toBe(remaining)
    const replaced = await importStoredFiles(rootSources([tail]), 'replace', 'attachments')
    expect(replaced.imported[0]).toMatchObject({ action: 'replaced', metadata: { id } })
  })

  it('rejects an import when the browser quota is lower than the application limit', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'storage')
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { estimate: async () => ({ quota: 100, usage: 99 }) },
    })
    try {
      const result = await importStoredFiles(
        rootSources([fileWithReportedSize('small.bin', 2)]),
        'keep',
      )
      expect(result.rejected[0]?.reason).toBe('storage-unavailable')
      expect((await listStoredFiles()).some(file => file.path === 'small.bin')).toBe(false)
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
    await removeStoredFiles([file.id])
    expect(await updateStoredTextFile(file.id, file.revision + 1, 'late')).toEqual({
      status: 'missing',
    })
    expect(await getStoredFile(file.id)).toBeNull()
  })
})
