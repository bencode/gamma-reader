import {
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react'
import { createStore } from 'zustand/vanilla'
import type { ReaderState } from '../core/local-tool-types'
import { createLocalTools, type LocalTools } from '../core/local-tools'
import type { Workspace } from './use-workspace'

export const createWorkspaceStore = (tabs: string[]) => createStore(() => ({ tabs }))
type ReaderBinding = {
  fileId: string
  getViewport: () => ReaderState['viewport']
  getPageNumber?: () => number | undefined
}
type WorkspaceContextValue = {
  tools: LocalTools
  register: (binding: ReaderBinding) => () => void
}
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export const WorkspaceProvider = ({
  workspace,
  rootRef,
  children,
}: {
  workspace: Workspace
  rootRef: RefObject<HTMLDivElement | null>
  children: ReactNode
}) => {
  const current = useRef(workspace)
  const readers = useRef(new Map<string, ReaderBinding>())
  useLayoutEffect(() => {
    current.current = workspace
  }, [workspace])
  const value = useMemo<WorkspaceContextValue>(
    () => ({
      register: binding => {
        readers.current.set(binding.fileId, binding)
        return () => {
          if (readers.current.get(binding.fileId) === binding)
            readers.current.delete(binding.fileId)
        }
      },
      tools: createLocalTools(() => {
        const latest = current.current
        const openFiles = latest.store.getState().tabs.flatMap(id => {
          const file = latest.files.find(file => file.id === id)
          return file ? [{ id: file.id, name: file.name }] : []
        })
        const file = latest.files.find(file => file.id === latest.activeId)
        const binding = file ? readers.current.get(file.id) : undefined
        const pageNumber = binding?.getPageNumber?.()
        const blocked = !rootRef.current || Boolean(rootRef.current.querySelector('dialog[open]'))
        return {
          openFiles,
          activeFile: file
            ? { id: file.id, name: file.name, ...(pageNumber !== undefined ? { pageNumber } : {}) }
            : null,
          viewport: blocked ? null : (binding?.getViewport() ?? null),
        }
      }),
    }),
    [rootRef],
  )
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

const useWorkspaceContext = () => {
  const context = useContext(WorkspaceContext)
  if (!context) throw new Error('A WorkspaceProvider is required.')
  return context
}

export const useLocalTools = () => useWorkspaceContext().tools

export const useReaderBinding = (binding: ReaderBinding, active: boolean) => {
  const { register } = useWorkspaceContext()
  useLayoutEffect(() => (active ? register(binding) : undefined), [active, binding, register])
}
