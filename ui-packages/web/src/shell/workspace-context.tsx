import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react'
import { useStore } from 'zustand'
import type { LocalTools, WorkspaceTextWriter } from '../core/local-tools'
import type { UpdateStoredTextFileResult } from '../data/file-store'
import { getStoredFile } from '../data/file-store'
import type { Workspace } from './use-workspace'
import { type ReaderBinding, useWorkspaceTools } from './use-workspace-tools'
import { sourceDirty, type WorkspaceActions, type WorkspaceStore } from './workspace-store'

type WorkspaceContextValue = {
  tools: LocalTools
  store: WorkspaceStore
  actions: WorkspaceActions
  register: (binding: ReaderBinding) => () => void
  saveSource: (fileId: string, overwrite?: boolean) => Promise<'saved' | 'conflict' | 'failed'>
}
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export const WorkspaceProvider = ({
  workspace,
  rootRef,
  writeTextFile,
  updateTextFile,
  children,
}: {
  workspace: Workspace
  rootRef: RefObject<HTMLDivElement | null>
  writeTextFile: WorkspaceTextWriter
  updateTextFile: (
    id: string,
    expectedRevision: number,
    content: string,
    signal?: AbortSignal,
  ) => Promise<UpdateStoredTextFileResult>
  children: ReactNode
}) => {
  const { actions, store } = workspace
  const readers = useRef(new Map<string, ReaderBinding>())
  const tools = useWorkspaceTools({ workspace, rootRef, readers, writeTextFile })
  const hasDirtySource = useStore(store, state =>
    Object.values(state.sourceDrafts).some(sourceDirty),
  )
  useEffect(() => {
    if (!hasDirtySource) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasDirtySource])

  const saveSource = useCallback(
    async (fileId: string, overwrite = false) => {
      const draft = store.getState().sourceDrafts[fileId]
      if (!draft || draft.savePhase === 'saving') return 'failed' as const
      const expectedRevision = overwrite ? draft.incoming?.revision : draft.base.revision
      if (expectedRevision === undefined) return 'failed' as const
      const savedContent = draft.content
      actions.beginSourceSave(fileId)
      try {
        const result = await updateTextFile(fileId, expectedRevision, savedContent)
        if (result.status === 'saved') {
          actions.completeSourceSave(fileId, {
            revision: result.metadata.revision,
            content: savedContent,
          })
          return 'saved' as const
        }
        if (result.status === 'conflict') {
          const latest = await getStoredFile(fileId)
          if (latest)
            actions.synchronizeSource(fileId, {
              revision: latest.metadata.revision,
              content: new TextDecoder('utf-8', { fatal: true }).decode(
                await latest.blob.arrayBuffer(),
              ),
            })
          actions.failSourceSave(fileId, 'The saved copy changed. Review the conflict below.', true)
          return 'conflict' as const
        }
        const message =
          result.status === 'missing'
            ? 'This file is no longer available in Files.'
            : result.reason === 'file-too-large'
              ? 'The edited file exceeds the 50 MB file limit.'
              : result.reason === 'library-full'
                ? 'The edited file exceeds the 500 MB library limit.'
                : 'The edited file does not fit in browser storage.'
        actions.failSourceSave(fileId, message, true)
        return 'failed' as const
      } catch (error) {
        console.error('Unable to save source', error)
        actions.failSourceSave(fileId, 'The source could not be saved. Try again.', true)
        return 'failed' as const
      }
    },
    [actions, store, updateTextFile],
  )
  const value = useMemo<WorkspaceContextValue>(
    () => ({
      store,
      actions,
      register: binding => {
        readers.current.set(binding.fileId, binding)
        return () => {
          if (readers.current.get(binding.fileId) === binding)
            readers.current.delete(binding.fileId)
        }
      },
      tools,
      saveSource,
    }),
    [actions, saveSource, store, tools],
  )
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

const useWorkspaceContext = () => {
  const context = useContext(WorkspaceContext)
  if (!context) throw new Error('A WorkspaceProvider is required.')
  return context
}

export const useWorkspaceStore = () => useWorkspaceContext().store

export const useLocalTools = () => useWorkspaceContext().tools

export const useWorkspaceSource = (fileId: string | null) => {
  const { store } = useWorkspaceContext()
  return useStore(store, state => (fileId ? state.sourceDrafts[fileId] : undefined))
}

export const useWorkspaceSourceActions = () => {
  const { actions, saveSource } = useWorkspaceContext()
  return useMemo(
    () => ({
      saveSource,
      synchronizeSource: actions.synchronizeSource,
      setSourceOpen: actions.setSourceOpen,
      updateSource: actions.updateSource,
      reloadIncomingSource: actions.reloadIncomingSource,
      forgetSource: actions.forgetSource,
    }),
    [actions, saveSource],
  )
}

export const useSourceDrafts = () => {
  const { store } = useWorkspaceContext()
  return useStore(store, state => state.sourceDrafts)
}

export const useReaderBinding = (binding: ReaderBinding, active: boolean) => {
  const { register } = useWorkspaceContext()
  useLayoutEffect(() => (active ? register(binding) : undefined), [active, binding, register])
}
