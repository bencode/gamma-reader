import { useEffect, useRef, useState } from 'react'
import type { StoredFileMetadata } from '../../core/files'
import {
  type FileNavigationState,
  type FileView,
  readFileNavigation,
  writeFileNavigation,
} from './file-navigation'

export type FileNavigation = FileNavigationState & {
  setView: (view: FileView) => void
  toggleStar: (fileId: string) => void
}

export const useFileNavigation = (
  files: readonly StoredFileMetadata[],
  ready: boolean,
  activeId: string | null,
): FileNavigation => {
  const [state, setState] = useState(readFileNavigation)
  const lastActive = useRef<string | null>(null)

  useEffect(() => {
    if (!ready) return
    const ids = new Set(files.map(file => file.id))
    const current = activeId && ids.has(activeId) ? activeId : null
    const visited = current !== null && current !== lastActive.current
    const openedAt = Date.now()
    lastActive.current = current
    setState(previous => {
      const recent = previous.recent.filter(item => ids.has(item.fileId))
      const starred = previous.starred.filter(id => ids.has(id))
      if (
        !visited &&
        recent.length === previous.recent.length &&
        starred.length === previous.starred.length
      )
        return previous
      return {
        ...previous,
        recent: visited
          ? [
              { fileId: current, openedAt },
              ...recent.filter(item => item.fileId !== current),
            ].slice(0, 50)
          : recent,
        starred,
      }
    })
  }, [files, ready, activeId])

  useEffect(() => writeFileNavigation(state), [state])

  const setView = (view: FileView) =>
    setState(previous => (previous.view === view ? previous : { ...previous, view }))
  const toggleStar = (fileId: string) => {
    if (!ready || !files.some(file => file.id === fileId)) return
    setState(previous => ({
      ...previous,
      starred: previous.starred.includes(fileId)
        ? previous.starred.filter(id => id !== fileId)
        : [fileId, ...previous.starred],
    }))
  }

  return { ...state, setView, toggleStar }
}
