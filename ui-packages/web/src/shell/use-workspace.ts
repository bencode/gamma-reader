import { startTransition, useEffect, useRef, useState } from 'react'
import { useLocation, useMatch, useNavigate } from 'react-router-dom'
import { samples } from '../core/samples'
import { readWorkspace, writeWorkspace } from './workspace-storage'

export type Quote = { id: string; documentId: string; source: string; text: string }

const documentPath = (id: string | null) => (id ? `/files/${encodeURIComponent(id)}` : '/files')

export const useWorkspace = () => {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const routeId = useMatch('/files/:documentId')?.params.documentId
  const activeId = samples.find(document => document.id === routeId)?.id ?? null
  const [initialWorkspace] = useState(readWorkspace)
  const [tabs, setTabs] = useState(initialWorkspace.tabs)
  const [draft, setDraft] = useState('')
  const [quotes, setQuotes] = useState<Quote[]>([])
  const scrollPositions = useRef(new Map<string, number>())
  const navigationTargetRef = useRef(activeId)

  useEffect(() => {
    navigationTargetRef.current = activeId
    if (pathname === '/') {
      void navigate(documentPath(initialWorkspace.lastActiveId), { replace: true })
      return
    }
    if (pathname !== '/files' && activeId === null) {
      void navigate('/files', { replace: true })
      return
    }
    if (activeId)
      setTabs(current => (current.includes(activeId) ? current : [...current, activeId]))
  }, [pathname, activeId, initialWorkspace.lastActiveId, navigate])

  useEffect(() => {
    if (pathname !== '/files' && (activeId === null || !tabs.includes(activeId))) return
    writeWorkspace({ tabs, lastActiveId: activeId })
  }, [tabs, activeId, pathname])

  const openDocument = (id: string) => {
    if (id === navigationTargetRef.current || !samples.some(document => document.id === id)) return
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
    const document = samples.find(sample => sample.id === documentId)
    if (!document || !text.trim()) return
    setQuotes(current => [
      ...current,
      { id: crypto.randomUUID(), documentId, source: document.name, text: text.trim() },
    ])
  }

  return {
    tabs,
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
