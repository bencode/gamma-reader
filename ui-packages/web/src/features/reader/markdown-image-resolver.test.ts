import { describe, expect, it } from 'vitest'
import type { StoredFileMetadata } from '../../core/files'
import { importStoredFiles, listStoredFiles } from '../../data/file-store'
import {
  createMarkdownImageResolver,
  findMarkdownImageFile,
  resolveMarkdownImagePath,
} from './markdown-image-resolver'

const metadata = (
  id: string,
  name: string,
  previewKind: StoredFileMetadata['previewKind'] = 'image',
  collection: StoredFileMetadata['collection'] = 'files',
) => ({
  id,
  name,
  collection,
  mediaType: previewKind === 'image' ? 'image/svg+xml' : 'text/plain',
  previewKind,
  size: 1,
  lastModified: 1,
  createdAt: 1,
  revision: 1,
})

describe('Markdown image resolution', () => {
  it.each([
    ['image.svg', 'docs/readme.md', 'docs/image.svg'],
    ['./abc/test.svg', 'docs/readme.md', 'docs/abc/test.svg'],
    ['../assets/a.svg', 'docs/readme.md', 'assets/a.svg'],
    ['/shared/a.svg', 'docs/readme.md', 'shared/a.svg'],
    ['My%20image.svg?raw#preview', 'readme.md', 'My image.svg'],
  ])('resolves %s from %s', (reference, basePath, expected) => {
    expect(resolveMarkdownImagePath(reference, basePath)).toBe(expected)
  })

  it.each([
    ['https://example.test/image.svg', 'readme.md'],
    ['data:image/svg+xml;base64,PHN2Zz4=', 'readme.md'],
    ['blob:https://example.test/id', 'readme.md'],
    ['//example.test/image.svg', 'readme.md'],
    ['../../outside.svg', 'readme.md'],
    ['bad%2', 'readme.md'],
    ['folder\\image.svg', 'readme.md'],
  ])('rejects %s', (reference, basePath) => {
    expect(resolveMarkdownImagePath(reference, basePath)).toBeNull()
  })

  it('matches a future logical path without falling back to its basename', () => {
    const nested = { ...metadata('nested', 'test.svg'), path: 'abc/test.svg' }
    expect(findMarkdownImageFile([nested], 'abc/test.svg', 'readme.md')).toBe(nested)
    expect(findMarkdownImageFile([nested], 'test.svg', 'readme.md')).toBeNull()
  })

  it('loads current root-level Files and excludes Attachments and non-images', async () => {
    await importStoredFiles(
      [new File(['<svg>local</svg>'], 'diagram.svg', { type: 'image/svg+xml' })],
      'keep',
    )
    await importStoredFiles(
      [new File(['attachment'], 'attachment.svg', { type: 'image/svg+xml' })],
      'keep',
      'attachments',
    )
    await importStoredFiles([new File(['text'], 'notes.txt', { type: 'text/plain' })], 'keep')
    const resolve = createMarkdownImageResolver(await listStoredFiles())

    await expect(resolve('./diagram.svg', 'readme.md')).resolves.toBeInstanceOf(Blob)
    await expect(resolve('attachment.svg', 'readme.md')).resolves.toBeNull()
    await expect(resolve('notes.txt', 'readme.md')).resolves.toBeNull()
  })
})
