import { CodeLabProvider, useCodeLabRuntime } from '@gamma-reader/code-lab'
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react'
import {
  useLabRunnerBinding,
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
  const value = useMemo(() => ({ model, editError }), [model, editError])

  return (
    <LabContext.Provider value={value}>
      <CodeLabProvider cells={model.cells} onCellChange={onCellChange}>
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
