import { describe, expect, it } from 'vitest'
import type { FolderExportRecord, WritableDirectoryHandle } from '../core/file-export'
import { getFolderExport, putFolderExport } from './folder-export-store'

describe('folder export store', () => {
  it('persists the selected directory and saved file revisions', async () => {
    const record: FolderExportRecord = {
      id: 'files',
      directory: { kind: 'directory', name: 'Reading' } as WritableDirectoryHandle,
      savedFiles: [{ id: 'notes', name: 'Notes.md', revision: 3 }],
      savedAt: 42,
    }

    await putFolderExport(record)

    await expect(getFolderExport()).resolves.toEqual(record)
  })
})
