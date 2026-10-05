import { type CodeLabLanguage, CodeLabProvider, useCodeLabRuntime } from '@gamma-reader/code-lab'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react'
import {
  useLabRunnerBinding,
  useWorkspaceSource,
  useWorkspaceSourceActions,
  useWorkspaceStore,
} from '../../../shell/workspace-context'
import type { DocumentScopeProps } from '../text-file-reader'
import {
  appendLabCell,
  ensureLabCellIds,
  type LabDocument,
  parseLabDocument,
  replaceLabCell,
} from './document-model'

type EditError = { cellId: string; message: string } | null
type LabContextValue = {
  model: LabDocument
  editError: EditError
  appendCell: (language: CodeLabLanguage) => void
}
const LabContext = createContext<LabContextValue | null>(null)

// Hands the agent this lab's runtime, with the cells of the draft as it is at each call.
const LabRunnerBinding = ({ fileId }: { fileId: string }) => {
  const store = useWorkspaceStore()
  const runtime = useCodeLabRuntime()
  const runner = useMemo(
    () => ({
      fileId,
      document: () => {
        const draft = store.getState().sourceDrafts[fileId]
        return draft
          ? { version: draft.version, cells: parseLabDocument(draft.content).cells }
          : null
      },
      runtime,
    }),
    [fileId, runtime, store],
  )
  useLabRunnerBinding(runner)
  return null
}

export const LabDocumentScope = ({ fileId, children }: DocumentScopeProps) => {
  const store = useWorkspaceStore()
  const draft = useWorkspaceSource(fileId)
  const actions = useWorkspaceSourceActions()
  const content = draft?.content ?? ''
  const model = useMemo(() => parseLabDocument(content), [content])
  const [editError, setEditError] = useState<EditError>(null)

  useLayoutEffect(() => {
    const latest = store.getState().sourceDrafts[fileId]
    if (!latest || latest.content !== content) return
    const normalized = ensureLabCellIds(latest.content)
    if (normalized !== latest.content) actions.updateSource(fileId, normalized)
  }, [actions, content, fileId, store])

  const onCellChange = useCallback(
    (cellId: string, source: string) => {
      try {
        const latest = store.getState().sourceDrafts[fileId]
        if (!latest) throw new Error('The source draft is no longer available.')
        actions.updateSource(fileId, replaceLabCell(latest.content, cellId, source))
        setEditError(null)
      } catch (error) {
        console.error('Unable to update lab cell', error)
        setEditError({
          cellId,
          message: error instanceof Error ? error.message : 'This cell could not be updated.',
        })
      }
    },
    [actions, fileId, store],
  )
  // A cell to bring into view with its editor focused, once the draft holds it and its editor has
  // been set up, a frame after the cell first renders.
  const [pending, setPending] = useState<string | null>(null)
  useEffect(() => {
    if (!pending || !model.cells.some(cell => cell.id === pending)) return
    const frame = requestAnimationFrame(() => {
      const cell = document.querySelector<HTMLElement>(`[data-lab-cell="${pending}"]`)
      cell?.scrollIntoView({ block: 'center' })
      cell?.querySelector<HTMLElement>('.cm-content')?.focus()
      setPending(null)
    })
    return () => cancelAnimationFrame(frame)
  }, [model, pending])

  // An empty cell at the end, in the draft as an edit in Source would be.
  const appendCell = useCallback(
    (language: CodeLabLanguage) => {
      const latest = store.getState().sourceDrafts[fileId]
      if (!latest) return
      const next = appendLabCell(latest.content, language)
      actions.updateSource(fileId, next.source)
      setPending(next.id)
    },
    [actions, fileId, store],
  )

  // Shift+Enter goes on to the next cell, or past the last one to a new cell in its language.
  const onCellAdvance = useCallback(
    (cellId: string) => {
      const latest = store.getState().sourceDrafts[fileId]
      if (!latest) return
      const { cells } = parseLabDocument(latest.content)
      const at = cells.findIndex(cell => cell.id === cellId)
      const next = cells[at + 1]
      if (next) setPending(next.id)
      else if (cells[at]) appendCell(cells[at].language)
    },
    [appendCell, fileId, store],
  )

  const value = useMemo(() => ({ model, editError, appendCell }), [model, editError, appendCell])

  return (
    <LabContext.Provider value={value}>
      <CodeLabProvider
        cells={model.cells}
        onCellChange={onCellChange}
        onCellAdvance={onCellAdvance}
      >
        <LabRunnerBinding fileId={fileId} />
        {children}
      </CodeLabProvider>
    </LabContext.Provider>
  )
}

export const useLabDocument = () => {
  const context = useContext(LabContext)
  if (!context) throw new Error('LabReader requires a LabDocumentScope.')
  return context
}
