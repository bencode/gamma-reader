import { describe, expect, it } from 'vitest'
import { type FolderEntry, maximumFolderFileBytes, selectFolderFiles } from './folder-import'

const entry = (path: string, size = 10, type = ''): FolderEntry => {
  const file = new File(['x'], path.slice(path.lastIndexOf('/') + 1), { type })
  Object.defineProperty(file, 'size', { value: size })
  return { path, file }
}

describe('folder import selection', () => {
  it('keeps readable files in path order and leaves out ignored, hidden, oversized and unreadable ones', () => {
    const selection = selectFolderFiles([
      entry('.repo/src/index.ts'),
      entry('.repo/README'),
      entry('.repo/docs/guide.md'),
      entry('.repo/node_modules/lib/index.js'),
      entry('.repo/src/.cache/state.json'),
      entry('.repo/.env'),
      entry('.repo/data/big.json', maximumFolderFileBytes + 1),
      entry('.repo/logo.bin', 10, 'application/octet-stream'),
    ])

    expect(selection).toEqual({
      status: 'ready',
      sources: [
        expect.objectContaining({ path: '.repo/docs/guide.md' }),
        expect.objectContaining({ path: '.repo/README' }),
        expect.objectContaining({ path: '.repo/src/index.ts' }),
      ],
      skipped: 5,
    })
  })

  it('takes up to a thousand files and refuses a folder with more', () => {
    const files = (count: number) =>
      Array.from({ length: count }, (_, index) => entry(`repo/f${index}.txt`))

    expect(selectFolderFiles(files(1000))).toMatchObject({ status: 'ready', skipped: 0 })
    expect(selectFolderFiles(files(1001))).toEqual({ status: 'too-many' })
  })
})
