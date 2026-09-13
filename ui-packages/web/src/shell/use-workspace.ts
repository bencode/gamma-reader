import { startTransition, useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useMatch, useNavigate } from 'react-router-dom'
import { useStore } from 'zustand'
import type { StoredFileMetadata } from '../core/files'
import { createWorkspaceStore } from './workspace-context'
import { readWorkspace, writeWorkspace } from './workspace-storage'

const documentPath = (id: string | null) => (id ? `/files/${encodeURIComponent(id)}` : '/files')

export const useWorkspace = (files: StoredFileMetadata[], filesLoading: boolean) => {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const routeId = useMatch('/files/:documentId')?.params.documentId
  const activeId = files.find(document => document.id === routeId)?.id ?? null
  const [initialWorkspace] = useState(readWorkspace)
  const [store] = useState(() => createWorkspaceStore(initialWorkspace.tabs))
  const tabs = useStore(store, state => state.tabs)
  const setTabs = useCallback(
    (update: (current: string[]) => string[]) =>
      store.setState(state => ({ tabs: update(state.tabs) })),
    [store],
  )
  const scrollPositions = useRef(new Map<string, number>())
  const navigationTargetRef = useRef(activeId)

  useEffect(() => {
    if (filesLoading) return
    navigationTargetRef.current = activeId
    if (pathname === '/') {
      void navigate(documentPath(initialWorkspace.lastActiveId), { replace: true })
      return
    }
    if (pathname !== '/files' && activeId === null) {
      void navigate('/files', { replace: true })
      return
    }
    setTabs(current => {
      const available = current.filter(id => files.some(file => file.id === id))
      return activeId && !available.includes(activeId) ? [...available, activeId] : available
    })
  }, [pathname, activeId, initialWorkspace.lastActiveId, navigate, files, filesLoading, setTabs])

  useEffect(() => {
    if (filesLoading || (pathname !== '/files' && (activeId === null || !tabs.includes(activeId))))
      return
    writeWorkspace({ tabs, lastActiveId: activeId })
  }, [tabs, activeId, pathname, filesLoading])

  const openDocument = (id: string) => {
    if (id === navigationTargetRef.current || !files.some(document => document.id === id)) return
    navigationTargetRef.current = id
    void navigate(documentPath(id))
  }

  const closeDocument = (id: string) => {
    const index = tabs.indexOf(id)
    if (index === -1) return
    startTransition(() => {
      setTabs(current => current.filter(tab => tab !== id))
      if (activeId === id)
        void navigate(documentPath(tabs[index + 1] ?? tabs[index - 1] ?? null), { replace: true })
    })
    scrollPositions.current.delete(id)
  }

  return {
    store,
    tabs,
    files,
    filesLoading,
    activeId,
    scrollPositions,
    openDocument,
    closeDocument,
  }
}

export type Workspace = ReturnType<typeof useWorkspace>
