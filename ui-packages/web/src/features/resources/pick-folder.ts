import {
  type FolderEntry,
  isFolderFileWanted,
  isIgnoredFolder,
  maximumFolderFiles,
} from '../../core/folder-import'

type FolderHandle = FileSystemDirectoryHandle & {
  values: () => AsyncIterable<FolderHandle | FileSystemFileHandle>
}
type FolderPickerWindow = Window & {
  showDirectoryPicker?: (options?: { id?: string; mode?: 'read' }) => Promise<FolderHandle>
}

const pickerWindow = () => window as FolderPickerWindow

// iPhone and iPad Safari offer no way to choose a folder; iPadOS reports itself as a Mac.
const isAppleMobile = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)

export const folderPickerAvailable = () => typeof pickerWindow().showDirectoryPicker === 'function'

export const folderImportSupported = () =>
  folderPickerAvailable() || ('webkitdirectory' in HTMLInputElement.prototype && !isAppleMobile())

export const pickFolder = async () => {
  const picker = pickerWindow().showDirectoryPicker
  if (!picker) throw new Error('Choosing folders is not supported in this browser.')
  return picker({ id: 'gamma-reader-import', mode: 'read' })
}

// Ignored folders are never entered, and the walk stops as soon as the folder is known to be
// over the limit, so a large repository costs no more than what is actually kept. Progress is
// reported every hundred files, often enough to show movement without a render per file.
export const readPickedFolder = async (folder: FolderHandle, onRead?: (count: number) => void) => {
  const entries: FolderEntry[] = []
  let wanted = 0
  const walk = async (current: FolderHandle, prefix: string): Promise<void> => {
    for await (const handle of current.values()) {
      if (wanted > maximumFolderFiles) return
      const path = `${prefix}/${handle.name}`
      if (handle.kind === 'directory') {
        if (!isIgnoredFolder(handle.name)) await walk(handle, path)
        continue
      }
      const entry = { path, file: await handle.getFile() }
      entries.push(entry)
      if (isFolderFileWanted(entry)) wanted += 1
      if (entries.length % 100 === 0) onRead?.(entries.length)
    }
  }
  await walk(folder, folder.name)
  return entries
}

// A browser without the folder picker hands over every file at once, each with its path.
export const entriesFromInput = (files: readonly File[]): FolderEntry[] =>
  files.map(file => ({ path: file.webkitRelativePath || file.name, file }))
