import { baseName } from './path'

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

export const pickerWindow = () => window as FilePickerWindow

export const folderExportSupported = () => typeof pickerWindow().showDirectoryPicker === 'function'

export const ensureDirectoryWritePermission = async (directory: WritableDirectoryHandle) => {
  if (!directory.queryPermission) return true
  const descriptor: PermissionDescriptor = { mode: 'readwrite' }
  if ((await directory.queryPermission(descriptor)) === 'granted') return true
  return directory.requestPermission
    ? (await directory.requestPermission(descriptor)) === 'granted'
    : false
}

const folderSegments = (path: string) => path.split('/').slice(0, -1)

// Something already standing on the path counts, whether it is the file itself or a file where
// one of its folders would go.
export const directoryContains = async (directory: FileSystemDirectoryHandle, path: string) => {
  try {
    let folder = directory
    for (const segment of folderSegments(path)) folder = await folder.getDirectoryHandle(segment)
    await folder.getFileHandle(baseName(path))
    return true
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return false
    if (error instanceof DOMException && error.name === 'TypeMismatchError') return true
    throw error
  }
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
  path: string,
  blob: Blob,
) => {
  let folder = directory
  for (const segment of folderSegments(path))
    folder = await folder.getDirectoryHandle(segment, { create: true })
  await writeBlob(await folder.getFileHandle(baseName(path), { create: true }), blob)
}

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
