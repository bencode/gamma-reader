import { useState } from 'react'
import type { FileCollection, StoredFileMetadata } from '../../core/files'
import { ancestorFolders } from './file-tree'

export type FolderExpansion = {
  expanded: Readonly<Record<FileCollection, ReadonlySet<string>>>
  toggle: (collection: FileCollection, key: string) => void
}

export const toggled = (set: ReadonlySet<string>, key: string) => {
  const next = new Set(set)
  if (!next.delete(key)) next.add(key)
  return next
}

// The folders opened in each tree. The workbench holds them, so they outlast the Files panel,
// which unmounts whenever it is hidden or the layout changes.
export const useFolderExpansion = (
  files: readonly StoredFileMetadata[],
  activeId: string | null,
): FolderExpansion => {
  const [expanded, setExpanded] = useState<FolderExpansion['expanded']>(() => ({
    files: new Set(),
    attachments: new Set(),
  }))
  const active = files.find(file => file.id === activeId)
  const activePath = active?.path ?? null
  const [revealedPath, setRevealedPath] = useState<string | null>(null)

  // Opening a file, or the open file moving, reveals its folders once; the reader may fold them
  // again afterwards.
  if (activePath !== revealedPath) {
    setRevealedPath(activePath)
    if (active) {
      const collection = active.collection ?? 'files'
      const ancestors = ancestorFolders(active.path)
      const shown = expanded[collection]
      if (ancestors.some(key => !shown.has(key)))
        setExpanded({ ...expanded, [collection]: new Set([...shown, ...ancestors]) })
    }
  }

  const toggle = (collection: FileCollection, key: string) =>
    setExpanded(current => ({ ...current, [collection]: toggled(current[collection], key) }))
  return { expanded, toggle }
}
