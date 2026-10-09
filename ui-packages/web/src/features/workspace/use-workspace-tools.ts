import { type RefObject, useLayoutEffect, useMemo, useRef } from 'react'
import { LocalToolError } from '../../core/agent/tool'
import type { ReaderState } from '../../core/reader-state'
import { getStoredFile, type UpdateStoredTextFileResult } from '../../data/file-store'
import { decodeUtf8 } from '../../utils/text'
import type { LabAccess, LabRunner } from '../assistant/lab-tools'
import type { LinkAccess } from '../assistant/links/link-tools'
import {
  type ActiveSourceSnapshot,
  createLocalTools,
  versionMismatch,
  type WorkspaceFileMover,
  type WorkspaceFileSaver,
  type WorkspaceTextWriter,
} from '../assistant/local-tools'
import type { NoteIndexStore } from '../links/use-note-index'
import { pageName, pageOfTab } from './page-tab'
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
  labs: RefObject<Map<string, LabRunner>>
  writeTextFile: WorkspaceTextWriter
  saveFile?: WorkspaceFileSaver
  moveFile: WorkspaceFileMover
  noteIndex?: NoteIndexStore
  updateTextFile: (
    id: string,
    expectedRevision: number,
    content: string,
  ) => Promise<UpdateStoredTextFileResult>
}

// A saved note's text, read as the agent's other text tools read it: UTF-8 or not at all.
const readSavedText = async (fileId: string) => {
  const stored = await getStoredFile(fileId)
  if (!stored) throw new LocalToolError('File not found.')
  const text = decodeUtf8(await stored.blob.arrayBuffer())
  if (text === null) throw new LocalToolError('This file is not valid UTF-8.')
  return text
}

const openTimeout = 2000

export const useWorkspaceTools = (options: WorkspaceToolsOptions) => {
  const { workspace, rootRef, readers, labs, noteIndex } = options
  const current = useRef(workspace)
  const writer = useRef(options.writeTextFile)
  const saver = useRef(options.saveFile)
  const mover = useRef(options.moveFile)
  const updater = useRef(options.updateTextFile)
  useLayoutEffect(() => {
    current.current = workspace
    writer.current = options.writeTextFile
    saver.current = options.saveFile
    mover.current = options.moveFile
    updater.current = options.updateTextFile
  }, [workspace, options.writeTextFile, options.saveFile, options.moveFile, options.updateTextFile])
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
          throw versionMismatch(expectedVersion)
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

  // The link index, and the library to name blocks in, for a workspace that keeps one.
  const links = useMemo<LinkAccess | undefined>(
    () =>
      noteIndex && {
        state: () => noteIndex.getState(),
        file: fileId => current.current.files.find(file => file.id === fileId),
        dirty: fileId => sourceDirty(current.current.store.getState().sourceDrafts[fileId]),
        read: readSavedText,
        update: (fileId, revision, content) => updater.current(fileId, revision, content),
      },
    [noteIndex],
  )

  const labAccess = useMemo<LabAccess>(
    () => ({
      active: () => {
        const latest = current.current
        const file = latest.files.find(candidate => candidate.id === latest.activeId)
        const runner = file ? labs.current.get(file.id) : undefined
        return file && runner ? { path: file.path, runner } : null
      },
      runner: fileId => labs.current.get(fileId),
    }),
    [labs],
  )

  return useMemo(() => {
    const readerState = (): ReaderState => {
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
      const page = latest.activeId ? pageOfTab(latest.activeId) : null
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
        ...(page !== null ? { activePage: pageName(noteIndex?.getState().graph, page) } : {}),
        viewport: blocked ? null : (binding?.getViewport() ?? null),
      }
    }
    // The address changes at once, but the active tab follows only once React renders it.
    const openFile = async (fileId: string, signal?: AbortSignal) => {
      if (!current.current.files.some(file => file.id === fileId))
        throw new LocalToolError('File not found. Run list to choose a workspace file.')
      current.current.openDocument(fileId)
      const deadline = Date.now() + openTimeout
      while (current.current.activeId !== fileId) {
        signal?.throwIfAborted()
        if (Date.now() > deadline) throw new LocalToolError('The file did not open. Try again.')
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      return readerState()
    }
    return createLocalTools(
      readerState,
      (path, content, signal) => writer.current(path, content, signal),
      (fileId, path, signal) => mover.current(fileId, path, signal),
      activeSource,
      links,
      labAccess,
      (path, file, signal) => {
        if (!saver.current) throw new LocalToolError('Saving files is unavailable.')
        return saver.current(path, file, signal)
      },
      openFile,
    )
  }, [activeSource, labAccess, links, noteIndex, readers, rootRef])
}
