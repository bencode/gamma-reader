import { startTransition, useEffect, useRef, useState } from 'react'
import { useLocation, useMatch, useNavigate } from 'react-router-dom'
import { useStore } from 'zustand'
import type { StoredFileMetadata } from '../core/files'
import { readWorkspace, writeWorkspace } from './workspace-storage'
import { createWorkspaceActions, createWorkspaceStore } from './workspace-store'

// The address carries the name the reader sees rather than the id the store keeps.
const documentPath = (files: readonly StoredFileMetadata[], id: string | null) => {
  const file = id ? files.find(document => document.id === id) : undefined
  return file ? `/files/${encodeURIComponent(file.name)}` : '/files'
}

// A name is unique in the library apart from case, and the only rename the app performs — the
// write tool replacing a file it matched case-insensitively — changes nothing else, so matching
// that way keeps an open document open across one. An id still resolves, which keeps links made
// before names reached the address working.
const documentIdFor = (files: readonly StoredFileMetadata[], segment: string | undefined) => {
  if (!segment) return null
  const wanted = segment.toLowerCase()
  return (
    files.find(file => file.name.toLowerCase() === wanted)?.id ??
    files.find(file => file.id === segment)?.id ??
    null
  )
}

export const useWorkspace = (files: StoredFileMetadata[], filesLoading: boolean) => {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const routeSegment = useMatch('/files/:documentId')?.params.documentId
  const activeId = documentIdFor(files, routeSegment)
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
      void navigate(documentPath(files, initialWorkspace.lastActiveId), { replace: true })
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
    void navigate(documentPath(files, id))
  }

  const closeDocuments = (ids: readonly string[]) => {
    const current = store.getState().tabs
    const closing = new Set(ids.filter(id => current.includes(id)))
    if (!closing.size) return
    const active = navigationTargetRef.current
    const index = active ? current.indexOf(active) : -1
    const next =
      current.slice(index + 1).find(id => !closing.has(id)) ??
      current.slice(0, index).findLast(id => !closing.has(id)) ??
      null
    startTransition(() => {
      actions.closeDocuments([...closing])
      if (active && closing.has(active)) {
        navigationTargetRef.current = next
        void navigate(documentPath(files, next), { replace: true })
      }
    })
    closing.forEach(id => {
      scrollPositions.current.delete(id)
    })
  }

  const closeDocument = (id: string) => closeDocuments([id])

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
    closeDocuments,
  }
}

export type Workspace = ReturnType<typeof useWorkspace>
