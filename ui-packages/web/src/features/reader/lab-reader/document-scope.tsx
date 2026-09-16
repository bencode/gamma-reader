import { CodeLabProvider } from '@gamma-reader/code-lab'
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react'
import {
  useWorkspaceSource,
  useWorkspaceSourceActions,
  useWorkspaceStore,
} from '../../../shell/workspace-context'
import type { DocumentScopeProps } from '../text-file-reader'
import {
  ensureLabCellIds,
  type LabDocument,
  parseLabDocument,
  replaceLabCell,
} from './document-model'

type EditError = { cellId: string; message: string } | null
const LabContext = createContext<{ model: LabDocument; editError: EditError } | null>(null)

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
  const value = useMemo(() => ({ model, editError }), [model, editError])

  return (
    <LabContext.Provider value={value}>
      <CodeLabProvider cells={model.cells} onCellChange={onCellChange}>
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
