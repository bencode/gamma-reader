import { describe, expect, it, vi } from 'vitest'
import { findDirectoryConflicts, saveBlobAs, writeBlobToDirectory } from './file-export'
import type { StoredFileMetadata } from './files'

const metadata = (id: string, path: string): StoredFileMetadata => ({
  id,
  path,
  collection: 'files',
  mediaType: 'text/plain',
  previewKind: 'text',
  size: 1,
  lastModified: 1,
  createdAt: 1,
  revision: 1,
})

const writableFile = (write: (data: Blob) => void): FileSystemFileHandle =>
  ({
    createWritable: async () =>
      ({
        write: async (data: Blob) => write(data),
        close: async () => {},
        abort: async () => {},
      }) as unknown as FileSystemWritableFileStream,
  }) as FileSystemFileHandle

type FakeFolder = Map<string, Blob | FakeFolder>

// Behaves like a real directory handle: folders and files share names, and nothing appears
// unless asked to be created.
const fakeDirectory = (folder: FakeFolder): FileSystemDirectoryHandle =>
  ({
    getDirectoryHandle: async (name: string, options?: { create?: boolean }) => {
      const entry = folder.get(name)
      if (entry instanceof Map) return fakeDirectory(entry)
      if (entry) throw new DOMException('A file is in the way', 'TypeMismatchError')
      if (!options?.create) throw new DOMException('Missing', 'NotFoundError')
      const created: FakeFolder = new Map()
      folder.set(name, created)
      return fakeDirectory(created)
    },
    getFileHandle: async (name: string, options?: { create?: boolean }) => {
      const entry = folder.get(name)
      if (entry instanceof Map)
        throw new DOMException('A folder is in the way', 'TypeMismatchError')
      if (!entry && !options?.create) throw new DOMException('Missing', 'NotFoundError')
      return writableFile(data => folder.set(name, data))
    },
  }) as unknown as FileSystemDirectoryHandle

describe('browser file export', () => {
  it('creates the folders of a path when writing a file', async () => {
    const root: FakeFolder = new Map()
    const blob = new Blob(['nested'])

    await writeBlobToDirectory(fakeDirectory(root), 'docs/v1.2/Notes.md', blob)

    const docs = root.get('docs')
    const version = docs instanceof Map ? docs.get('v1.2') : undefined
    expect(version instanceof Map ? version.get('Notes.md') : undefined).toBe(blob)
  })

  it('reports a path as a conflict when a file stands where one of its folders would go', async () => {
    const notes: FakeFolder = new Map([['a.md', new Blob(['existing'])]])
    const root: FakeFolder = new Map<string, Blob | FakeFolder>([
      ['docs', new Blob(['a file named docs'])],
      ['notes', notes],
    ])
    const files = [
      metadata('blocked', 'docs/a.md'),
      metadata('existing', 'notes/a.md'),
      metadata('new', 'missing/b.md'),
    ]

    await expect(findDirectoryConflicts(fakeDirectory(root), files, [])).resolves.toEqual([
      'docs/a.md',
      'notes/a.md',
    ])
  })

  it('ignores managed files and reports new name conflicts before writing', async () => {
    const files = [metadata('managed', 'Managed.md'), metadata('new', 'Existing.md')]
    const directory = {
      getFileHandle: vi.fn(async (name: string) => {
        if (name === 'Managed.md' || name === 'Existing.md') return writableFile(() => {})
        throw new DOMException('Missing', 'NotFoundError')
      }),
    } as unknown as FileSystemDirectoryHandle

    await expect(
      findDirectoryConflicts(directory, files, [
        { id: 'managed', path: 'Managed.md', revision: 1 },
      ]),
    ).resolves.toEqual(['Existing.md'])
    expect(directory.getFileHandle).toHaveBeenCalledOnce()
  })

  it('writes the original Blob to a directory file', async () => {
    const writes: Blob[] = []
    const directory = {
      getFileHandle: vi.fn(async () => writableFile(data => writes.push(data))),
    } as unknown as FileSystemDirectoryHandle
    const blob = new Blob(['local content'], { type: 'text/plain' })

    await writeBlobToDirectory(directory, 'Notes.txt', blob)

    expect(directory.getFileHandle).toHaveBeenCalledWith('Notes.txt', { create: true })
    expect(writes).toEqual([blob])
  })

  it('uses a browser download when the save-file picker is unavailable', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const blob = new Blob(['download'])

    await saveBlobAs('Download.txt', blob)

    expect(URL.createObjectURL).toHaveBeenCalledWith(blob)
    expect(click).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:gamma-reader-preview')
  })

  it('passes the original name and Blob through the native save picker', async () => {
    const writes: Blob[] = []
    const picker = vi.fn(async () => writableFile(data => writes.push(data)))
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: picker })
    const blob = new Blob(['native'])
    try {
      await saveBlobAs('Native.md', blob)
    } finally {
      Reflect.deleteProperty(window, 'showSaveFilePicker')
    }

    expect(picker).toHaveBeenCalledWith({ suggestedName: 'Native.md' })
    expect(writes).toEqual([blob])
  })
})
