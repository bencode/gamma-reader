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

// A folder looks the same whether it was picked or dropped: it lists its children, and a file
// opens on request.
type FolderNode =
  | { kind: 'directory'; name: string; children: () => AsyncIterable<FolderNode> }
  | { kind: 'file'; name: string; file: () => Promise<File> }

const handleNode = (handle: FolderHandle | FileSystemFileHandle): FolderNode =>
  handle.kind === 'directory'
    ? {
        kind: 'directory',
        name: handle.name,
        children: async function* () {
          for await (const child of handle.values()) yield handleNode(child)
        },
      }
    : { kind: 'file', name: handle.name, file: () => handle.getFile() }

// A dropped folder lists its entries in batches until a batch comes back empty.
const entryNode = (entry: FileSystemEntry): FolderNode =>
  entry.isDirectory
    ? {
        kind: 'directory',
        name: entry.name,
        children: async function* () {
          const reader = (entry as FileSystemDirectoryEntry).createReader()
          for (;;) {
            const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
              reader.readEntries(resolve, reject),
            )
            if (!batch.length) return
            for (const child of batch) yield entryNode(child)
          }
        },
      }
    : {
        kind: 'file',
        name: entry.name,
        file: () =>
          new Promise<File>((resolve, reject) =>
            (entry as FileSystemFileEntry).file(resolve, reject),
          ),
      }

// Ignored folders are never entered, and the walk stops as soon as the folder is known to be
// over the limit, so a large repository costs no more than what is actually kept. Progress is
// reported every hundred files, often enough to show movement without a render per file.
const readFolders = async (roots: readonly FolderNode[], onRead?: (count: number) => void) => {
  const entries: FolderEntry[] = []
  let wanted = 0
  const visit = async (node: FolderNode, path: string): Promise<void> => {
    if (wanted > maximumFolderFiles) return
    if (node.kind === 'directory') {
      for await (const child of node.children()) {
        if (wanted > maximumFolderFiles) return
        if (child.kind === 'directory' && isIgnoredFolder(child.name)) continue
        await visit(child, `${path}/${child.name}`)
      }
      return
    }
    const entry = { path, file: await node.file() }
    entries.push(entry)
    if (isFolderFileWanted(entry)) wanted += 1
    if (entries.length % 100 === 0) onRead?.(entries.length)
  }
  for (const root of roots) await visit(root, root.name)
  return entries
}

export const readPickedFolder = (folder: FolderHandle, onRead?: (count: number) => void) =>
  readFolders([handleNode(folder)], onRead)

// Folders dropped together import together, each under its own name; loose files dropped with
// them land at the root.
export const readDroppedEntries = (
  entries: readonly FileSystemEntry[],
  onRead?: (count: number) => void,
) => readFolders(entries.map(entryNode), onRead)

// A browser without the folder picker hands over every file at once, each with its path.
export const entriesFromInput = (files: readonly File[]): FolderEntry[] =>
  files.map(file => ({ path: file.webkitRelativePath || file.name, file }))
