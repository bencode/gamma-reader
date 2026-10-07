import { startTransition, useEffect, useRef, useState } from 'react'
import { useLocation, useMatch, useNavigate } from 'react-router-dom'
import { useStore } from 'zustand'
import type { StoredFileMetadata } from '../core/files'
import { pageOfTab, pagePath, pageTabId } from './page-tab'
import { viewOfTab, viewPath, viewTabOfRoute } from './view-tab'
import { readWorkspace, writeWorkspace } from './workspace-storage'
import { createWorkspaceActions, createWorkspaceStore } from './workspace-store'

// The address carries the path the reader sees rather than the id the store keeps, one encoded
// segment per folder. A page with no note is addressed by its name, and a view by its own.
const documentPath = (files: readonly StoredFileMetadata[], id: string | null) => {
  const page = id ? pageOfTab(id) : null
  if (page !== null) return pagePath(page)
  const view = id ? viewOfTab(id) : null
  if (view !== null) return viewPath(view)
  const file = id ? files.find(document => document.id === id) : undefined
  return file ? `/files/${file.path.split('/').map(encodeURIComponent).join('/')}` : '/files'
}

// A tab holds a file of the library, a page with no note, or a view.
const openable = (files: readonly StoredFileMetadata[], id: string) =>
  pageOfTab(id) !== null || viewOfTab(id) !== null || files.some(file => file.id === id)

// A path is unique in the library apart from case, and the only rename the app performs — the
// write tool replacing a file it matched case-insensitively — changes nothing else, so matching
// that way keeps an open document open across one. An id still resolves, which keeps links made
// before paths reached the address working.
const documentIdFor = (files: readonly StoredFileMetadata[], route: string | undefined) => {
  if (!route) return null
  const wanted = route.toLowerCase()
  return (
    files.find(file => file.path.toLowerCase() === wanted)?.id ??
    files.find(file => file.id === route)?.id ??
    null
  )
}

export const useWorkspace = (files: StoredFileMetadata[], filesLoading: boolean) => {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const routePath = useMatch('/files/*')?.params['*']
  const pageRoute = useMatch('/pages/:name')?.params.name
  const viewRoute = useMatch('/views/:name')?.params.name
  const activeId = pageRoute
    ? pageTabId(pageRoute)
    : (viewTabOfRoute(viewRoute) ?? documentIdFor(files, routePath))
  const [initialWorkspace] = useState(readWorkspace)
  const [store] = useState(() =>
    createWorkspaceStore(initialWorkspace.tabs, initialWorkspace.positions),
  )
  const [actions] = useState(() => createWorkspaceActions(store))
  const tabs = useStore(store, state => state.tabs)
  const navigationTargetRef = useRef(activeId)
  // The document the address last named, with the path it had then, so a move can be followed.
  const shownRef = useRef<{ id: string; path: string } | null>(null)
  const savedActiveId = useRef(initialWorkspace.lastActiveId)

  useEffect(() => {
    if (filesLoading) return
    Object.keys(store.getState().sourceDrafts).forEach(id => {
      if (!files.some(file => file.id === id)) actions.forgetSource(id)
    })
    const shown = files.find(file => file.id === activeId)
    // The open document moved: the address still holds its old path, so it moves along.
    const moved =
      activeId === null && routePath?.toLowerCase() === shownRef.current?.path.toLowerCase()
        ? files.find(file => file.id === shownRef.current?.id)
        : undefined
    shownRef.current = shown ? { id: shown.id, path: shown.path } : shownRef.current
    if (moved) {
      void navigate(documentPath(files, moved.id), { replace: true })
      return
    }
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
      const available = current.filter(id => openable(files, id))
      return activeId && !available.includes(activeId) ? [...available, activeId] : available
    })
  }, [
    pathname,
    routePath,
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
    savedActiveId.current = activeId
    writeWorkspace({ tabs, lastActiveId: activeId, positions: store.getState().positions })
  }, [tabs, activeId, pathname, filesLoading, store])

  // A reader reports its position as it scrolls; storage hears about it once the reader pauses,
  // and before the page goes away.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const save = () => {
      clearTimeout(timer)
      timer = undefined
      const { tabs, positions } = store.getState()
      writeWorkspace({ tabs, lastActiveId: savedActiveId.current, positions })
    }
    const flush = () => {
      if (timer !== undefined) save()
    }
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.positions === previous.positions) return
      clearTimeout(timer)
      timer = setTimeout(save, 1000)
    })
    window.addEventListener('pagehide', flush)
    return () => {
      unsubscribe()
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [store])

  const openDocument = (id: string) => {
    if (id === navigationTargetRef.current || !openable(files, id)) return
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
  }

  const closeDocument = (id: string) => closeDocuments([id])

  return {
    store,
    actions,
    tabs,
    files,
    filesLoading,
    activeId,
    openDocument,
    closeDocument,
    closeDocuments,
  }
}

export type Workspace = ReturnType<typeof useWorkspace>
