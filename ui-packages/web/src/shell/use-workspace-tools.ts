import { type RefObject, useLayoutEffect, useMemo, useRef } from 'react'
import type { ReaderState } from '../core/reader-state'
import {
  type ActiveSourceSnapshot,
  createLocalTools,
  type WorkspaceFileMover,
  type WorkspaceTextWriter,
} from '../features/agent/local-tools'
import { LocalToolError } from '../features/agent/tool-types'
import type { Workspace } from './use-workspace'
import { sourceDirty } from './workspace-store'

export type ReaderBinding = {
  fileId: string
  getViewport: () => ReaderState['viewport']
  getPageNumber?: () => number | undefined
}

type WorkspaceToolsOptions = {
  workspace: Workspace
  rootRef: RefObject<HTMLDivElement | null>
  readers: RefObject<Map<string, ReaderBinding>>
  writeTextFile: WorkspaceTextWriter
  moveFile: WorkspaceFileMover
}

export const useWorkspaceTools = (options: WorkspaceToolsOptions) => {
  const { workspace, rootRef, readers } = options
  const current = useRef(workspace)
  const writer = useRef(options.writeTextFile)
  const mover = useRef(options.moveFile)
  useLayoutEffect(() => {
    current.current = workspace
    writer.current = options.writeTextFile
    mover.current = options.moveFile
  }, [workspace, options.writeTextFile, options.moveFile])
  const activeSource = useMemo(
    () => ({
      get: (): ActiveSourceSnapshot | null => {
        const latest = current.current
        const file = latest.files.find(candidate => candidate.id === latest.activeId)
        const draft = file ? latest.store.getState().sourceDrafts[file.id] : undefined
        return file && draft
          ? { fileId: file.id, path: file.path, version: draft.version, content: draft.content }
          : null
      },
      replace: (fileId: string, expectedVersion: string, content: string): ActiveSourceSnapshot => {
        const latest = current.current
        const file = latest.files.find(candidate => candidate.id === latest.activeId)
        const draft = file ? latest.store.getState().sourceDrafts[file.id] : undefined
        if (!file || !draft)
          throw new LocalToolError('The active file has no editable source or is still loading.')
        if (file.id !== fileId || draft.version !== expectedVersion)
          throw new LocalToolError('Source changed. Call read_active_source again.')
        latest.actions.updateSource(file.id, content)
        const updated = latest.store.getState().sourceDrafts[file.id]
        if (!updated) throw new LocalToolError('The active source is no longer available.')
        return {
          fileId: file.id,
          path: file.path,
          version: updated.version,
          content: updated.content,
        }
      },
    }),
    [],
  )

  return useMemo(
    () =>
      createLocalTools(
        () => {
          const latest = current.current
          const openFiles = latest.store.getState().tabs.flatMap(id => {
            const file = latest.files.find(file => file.id === id)
            return file ? [{ id: file.id, path: file.path, type: file.previewKind }] : []
          })
          const file = latest.files.find(file => file.id === latest.activeId)
          const binding = file ? readers.current.get(file.id) : undefined
          const pageNumber = binding?.getPageNumber?.()
          const draft = file ? latest.store.getState().sourceDrafts[file.id] : undefined
          const blocked = !rootRef.current || Boolean(rootRef.current.querySelector('dialog[open]'))
          return {
            openFiles,
            activeFile: file
              ? {
                  id: file.id,
                  path: file.path,
                  type: file.previewKind,
                  ...(pageNumber !== undefined ? { pageNumber } : {}),
                  ...(draft ? { source: { dirty: sourceDirty(draft) } } : {}),
                }
              : null,
            viewport: blocked ? null : (binding?.getViewport() ?? null),
          }
        },
        (path, content, signal) => writer.current(path, content, signal),
        (fileId, path, signal) => mover.current(fileId, path, signal),
        activeSource,
      ),
    [activeSource, readers, rootRef],
  )
}
