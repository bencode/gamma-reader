import type { FolderExportRecord } from '../core/file-export'
import { openWorkspaceDatabase } from './workspace-database'

const folderExportId = 'files'

export const getFolderExport = async () => {
  const database = await openWorkspaceDatabase()
  return (await database.get('folderExports', folderExportId)) ?? null
}

export const putFolderExport = async (record: FolderExportRecord) => {
  const database = await openWorkspaceDatabase()
  await database.put('folderExports', record)
}
