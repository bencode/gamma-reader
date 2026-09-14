import { describe, expect, it, vi } from 'vitest'
import { findDirectoryConflicts, saveBlobAs, writeBlobToDirectory } from './file-export'
import type { StoredFileMetadata } from './files'

const metadata = (id: string, name: string): StoredFileMetadata => ({
  id,
  name,
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

describe('browser file export', () => {
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
        { id: 'managed', name: 'Managed.md', revision: 1 },
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
