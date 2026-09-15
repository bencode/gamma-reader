import { startTransition, useEffect, useRef, useState } from 'react'
import { useLocation, useMatch, useNavigate } from 'react-router-dom'
import { useStore } from 'zustand'
import type { StoredFileMetadata } from '../core/files'
import { readWorkspace, writeWorkspace } from './workspace-storage'
import { createWorkspaceActions, createWorkspaceStore } from './workspace-store'

const documentPath = (id: string | null) => (id ? `/files/${encodeURIComponent(id)}` : '/files')

export const useWorkspace = (files: StoredFileMetadata[], filesLoading: boolean) => {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const routeId = useMatch('/files/:documentId')?.params.documentId
  const activeId = files.find(document => document.id === routeId)?.id ?? null
  const [initialWorkspace] = useState(readWorkspace)
  const [store] = useState(() => createWorkspaceStore(initialWorkspace.tabs))
  const [actions] = useState(() => createWorkspaceActions(store))
  const tabs = useStore(store, state => state.tabs)
  const scrollPositions = useRef(new Map<string, number>())
  const navigationTargetRef = useRef(activeId)

  useEffect(() => {
    if (filesLoading) return
    Object.keys(store.getState().sourceDrafts).forEach(id => {
      if (!files.some(file => file.id === id)) actions.forgetSource(id)
    })
    navigationTargetRef.current = activeId
    if (pathname === '/') {
      void navigate(documentPath(initialWorkspace.lastActiveId), { replace: true })
      return
    }
    if (pathname !== '/files' && activeId === null) {
      void navigate('/files', { replace: true })
      return
    }
    actions.setTabs(current => {
      const available = current.filter(id => files.some(file => file.id === id))
      return activeId && !available.includes(activeId) ? [...available, activeId] : available
    })
  }, [
    pathname,
    activeId,
    initialWorkspace.lastActiveId,
    navigate,
    files,
    filesLoading,
    actions,
    store,
  ])

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
      actions.setTabs(current => current.filter(tab => tab !== id))
      if (activeId === id)
        void navigate(documentPath(tabs[index + 1] ?? tabs[index - 1] ?? null), { replace: true })
    })
    scrollPositions.current.delete(id)
    actions.forgetSource(id)
  }

  return {
    store,
    actions,
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
