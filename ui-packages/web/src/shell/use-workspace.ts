import { useRef, useState } from 'react'
import { samples } from '../core/samples'

export type Quote = { id: string; documentId: string; source: string; text: string }

export const useWorkspace = () => {
  const [tabs, setTabs] = useState(['getting-started'])
  const [activeId, setActiveId] = useState<string | null>('getting-started')
  const [draft, setDraft] = useState('')
  const [quotes, setQuotes] = useState<Quote[]>([])
  const scrollPositions = useRef(new Map<string, number>())

  const openDocument = (id: string) => {
    if (!samples.some(document => document.id === id)) return
    setTabs(current => (current.includes(id) ? current : [...current, id]))
    setActiveId(id)
  }

  const closeDocument = (id: string) => {
    const index = tabs.indexOf(id)
    if (index === -1) return
    if (activeId === id) setActiveId(tabs[index + 1] ?? tabs[index - 1] ?? null)
    setTabs(current => current.filter(tab => tab !== id))
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
    setActiveId,
    setDraft,
    addQuote,
    removeQuote: (id: string) => setQuotes(current => current.filter(quote => quote.id !== id)),
  }
}

export type Workspace = ReturnType<typeof useWorkspace>
