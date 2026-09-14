import type { StoredFileMetadata } from './files'

type FileSystemPermissionMode = 'read' | 'readwrite'
type FileSystemPermissionState = 'denied' | 'granted' | 'prompt'
type PermissionDescriptor = { mode: FileSystemPermissionMode }

export type WritableDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor?: PermissionDescriptor) => Promise<FileSystemPermissionState>
  requestPermission?: (descriptor?: PermissionDescriptor) => Promise<FileSystemPermissionState>
}

type DirectoryPickerOptions = {
  id?: string
  mode?: FileSystemPermissionMode
  startIn?: FileSystemHandle
}

type SaveFilePickerOptions = { suggestedName?: string }

type FilePickerWindow = Window & {
  showDirectoryPicker?: (options?: DirectoryPickerOptions) => Promise<WritableDirectoryHandle>
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>
}

export type ExportedFileVersion = Pick<StoredFileMetadata, 'id' | 'name' | 'revision'>

export type FolderExportRecord = {
  id: 'files'
  directory: WritableDirectoryHandle
  savedFiles: ExportedFileVersion[]
  savedAt: number
}

const pickerWindow = () => window as FilePickerWindow

export const folderExportSupported = () => typeof pickerWindow().showDirectoryPicker === 'function'

export const pickExportDirectory = async (startIn?: WritableDirectoryHandle) => {
  const picker = pickerWindow().showDirectoryPicker
  if (!picker) throw new Error('Saving folders is not supported in this browser.')
  return picker({ id: 'gamma-reader-files', mode: 'readwrite', startIn })
}

export const ensureDirectoryWritePermission = async (directory: WritableDirectoryHandle) => {
  if (!directory.queryPermission) return true
  const descriptor: PermissionDescriptor = { mode: 'readwrite' }
  if ((await directory.queryPermission(descriptor)) === 'granted') return true
  return directory.requestPermission
    ? (await directory.requestPermission(descriptor)) === 'granted'
    : false
}

const directoryContains = async (directory: FileSystemDirectoryHandle, name: string) => {
  try {
    await directory.getFileHandle(name)
    return true
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return false
    if (error instanceof DOMException && error.name === 'TypeMismatchError') return true
    throw error
  }
}

export const findDirectoryConflicts = async (
  directory: FileSystemDirectoryHandle,
  files: readonly StoredFileMetadata[],
  savedFiles: readonly ExportedFileVersion[],
) => {
  const managed = new Set(savedFiles.map(file => `${file.id}\0${file.name}`))
  const conflicts: string[] = []
  for (const file of files) {
    if (managed.has(`${file.id}\0${file.name}`)) continue
    if (await directoryContains(directory, file.name)) conflicts.push(file.name)
  }
  return conflicts
}

const writeBlob = async (handle: FileSystemFileHandle, blob: Blob) => {
  const writable = await handle.createWritable()
  try {
    await writable.write(blob)
    await writable.close()
  } catch (error) {
    try {
      await writable.abort(error)
    } catch (abortError) {
      console.error('Unable to abort a failed file export', abortError)
    }
    throw error
  }
}

export const writeBlobToDirectory = async (
  directory: FileSystemDirectoryHandle,
  name: string,
  blob: Blob,
) => writeBlob(await directory.getFileHandle(name, { create: true }), blob)

const downloadBlob = (name: string, blob: Blob) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

export const saveBlobAs = async (name: string, blob: Blob) => {
  const picker = pickerWindow().showSaveFilePicker
  if (!picker) {
    downloadBlob(name, blob)
    return
  }
  await writeBlob(await picker({ suggestedName: name }), blob)
}

export const pickerCancelled = (error: unknown) =>
  error instanceof DOMException && error.name === 'AbortError'
