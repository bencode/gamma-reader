import type { StoredFileMetadata } from '../../core/files'
import type { ExportedFileVersion } from '../../data/workspace-database'
import {
  directoryContains,
  pickerWindow,
  type WritableDirectoryHandle,
} from '../../utils/file-system-access'

export const pickExportDirectory = async (startIn?: WritableDirectoryHandle) => {
  const picker = pickerWindow().showDirectoryPicker
  if (!picker) throw new Error('Saving folders is not supported in this browser.')
  return picker({ id: 'gamma-reader-files', mode: 'readwrite', startIn })
}

export const findDirectoryConflicts = async (
  directory: FileSystemDirectoryHandle,
  files: readonly StoredFileMetadata[],
  savedFiles: readonly ExportedFileVersion[],
) => {
  const managed = new Set(savedFiles.map(file => `${file.id}\0${file.path}`))
  const conflicts: string[] = []
  for (const file of files) {
    if (managed.has(`${file.id}\0${file.path}`)) continue
    if (await directoryContains(directory, file.path)) conflicts.push(file.path)
  }
  return conflicts
}
