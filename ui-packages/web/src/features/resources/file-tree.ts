import { baseName, type StoredFileMetadata } from '../../core/files'

export type FileTreeNode =
  | { kind: 'folder'; key: string; path: string; name: string; children: FileTreeNode[] }
  | { kind: 'file'; file: StoredFileMetadata; name: string }

type FolderNode = Extract<FileTreeNode, { kind: 'folder' }>

const folderOrder = (left: FolderNode, right: FolderNode) =>
  left.name.localeCompare(right.name, undefined, { sensitivity: 'base', numeric: true })

const ordered = (nodes: FileTreeNode[]): FileTreeNode[] => [
  ...nodes
    .filter((node): node is FolderNode => node.kind === 'folder')
    .sort(folderOrder)
    .map(folder => ({ ...folder, children: ordered(folder.children) })),
  ...nodes.filter(node => node.kind === 'file'),
]

// Folders exist only through the paths of their files. Paths are unique apart from case, so a
// folder is keyed by its lower-cased path and shown with the spelling met first; files keep the
// order they arrive in, which leaves a library without folders exactly as it was.
export const buildFileTree = (files: readonly StoredFileMetadata[]): FileTreeNode[] => {
  const root: FileTreeNode[] = []
  const folders = new Map<string, FolderNode>()
  for (const file of files) {
    const segments = file.path.split('/').slice(0, -1)
    let siblings = root
    segments.forEach((segment, index) => {
      const key = segments
        .slice(0, index + 1)
        .join('/')
        .toLowerCase()
      let folder = folders.get(key)
      if (!folder) {
        folder = {
          kind: 'folder',
          key,
          path: segments.slice(0, index + 1).join('/'),
          name: segment,
          children: [],
        }
        folders.set(key, folder)
        siblings.push(folder)
      }
      siblings = folder.children
    })
    siblings.push({ kind: 'file', file, name: baseName(file.path) })
  }
  return ordered(root)
}

export const ancestorFolders = (path: string) => {
  const segments = path.toLowerCase().split('/').slice(0, -1)
  return segments.map((_, index) => segments.slice(0, index + 1).join('/'))
}

// Every file a folder holds, however deeply, matched as the tree groups folders: ignoring case.
export const filesInFolder = (files: readonly StoredFileMetadata[], folder: string) => {
  const prefix = `${folder.toLowerCase()}/`
  return files.filter(file => file.path.toLowerCase().startsWith(prefix))
}
