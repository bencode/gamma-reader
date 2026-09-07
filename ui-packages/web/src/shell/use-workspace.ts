import { startTransition, useEffect, useRef, useState } from 'react'
import { useLocation, useMatch, useNavigate } from 'react-router-dom'
import type { StoredFileMetadata } from '../core/files'
import { readWorkspace, writeWorkspace } from './workspace-storage'

export type Quote = { id: string; documentId: string; source: string; text: string }

const documentPath = (id: string | null) => (id ? `/files/${encodeURIComponent(id)}` : '/files')

export const useWorkspace = (files: StoredFileMetadata[], filesLoading: boolean) => {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const routeId = useMatch('/files/:documentId')?.params.documentId
  const activeId = files.find(document => document.id === routeId)?.id ?? null
  const [initialWorkspace] = useState(readWorkspace)
  const [tabs, setTabs] = useState(initialWorkspace.tabs)
  const [draft, setDraft] = useState('')
  const [quotes, setQuotes] = useState<Quote[]>([])
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
  }, [pathname, activeId, initialWorkspace.lastActiveId, navigate, files, filesLoading])

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

  const addQuote = (documentId: string, text: string) => {
    const document = files.find(file => file.id === documentId)
    if (!document || !text.trim()) return
    setQuotes(current => [
      ...current,
      { id: crypto.randomUUID(), documentId, source: document.name, text: text.trim() },
    ])
  }

  return {
    tabs,
    files,
    filesLoading,
    activeId,
    draft,
    quotes,
    scrollPositions,
    openDocument,
    closeDocument,
    setDraft,
    addQuote,
    removeQuote: (id: string) => setQuotes(current => current.filter(quote => quote.id !== id)),
  }
}

export type Workspace = ReturnType<typeof useWorkspace>
