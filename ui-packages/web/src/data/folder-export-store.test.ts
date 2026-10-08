import { describe, expect, it } from 'vitest'
import type { WritableDirectoryHandle } from '../utils/file-system-access'
import { getFolderExport, putFolderExport } from './folder-export-store'
import type { FolderExportRecord } from './workspace-database'

describe('folder export store', () => {
  it('persists the selected directory and saved file revisions', async () => {
    const record: FolderExportRecord = {
      id: 'files',
      directory: { kind: 'directory', name: 'Reading' } as WritableDirectoryHandle,
      savedFiles: [{ id: 'notes', path: 'Notes.md', revision: 3 }],
      savedAt: 42,
    }

    await putFolderExport(record)

    await expect(getFolderExport()).resolves.toEqual(record)
  })
})
