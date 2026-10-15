import type { CellExecution } from '@gamma-reader/code-lab'
import { buildGraph, isNotePath, parseNote } from '@gamma-reader/links'
import { typescriptRuntime } from '../../../../../code-lab/src/runtime/languages/typescript'
import { previewKindFor, rootSources } from '../../../core/files'
import type { ReaderState } from '../../../core/reader-state'
import {
  getStoredFileContent,
  importStoredFiles,
  listStoredFiles,
  moveStoredFile,
  writeStoredTextFile,
} from '../../../data/file-store'
import { ensureLabCellIds, parseLabDocument } from '../../reader/lab-reader/document-model'
import type { LabRunner } from '../lab-tools'
import { type ActiveSourceSnapshot, createLocalTools } from '../local-tools'

// Only the browser UI is simulated. Files, source editing, links, cell parsing and TypeScript
// execution use the app's implementations; the model endpoint is never mocked.
export const workspace = () => {
  let active: ActiveSourceSnapshot | null = null
  let savedContent = ''
  let version = 0
  const executions = new Map<string, CellExecution>()
  const state = (): ReaderState => ({
    openFiles: active
      ? [{ id: active.fileId, path: active.path, type: previewKindFor(active.path, '') }]
      : [],
    activeFile: active
      ? {
          id: active.fileId,
          path: active.path,
          type: previewKindFor(active.path, ''),
          source: { dirty: active.content !== savedContent },
        }
      : null,
    viewport: null,
  })
  const replace = (fileId: string, expectedVersion: string, content: string) => {
    if (active?.fileId !== fileId || active.version !== expectedVersion)
      throw new Error('The source changed.')
    active = {
      ...active,
      content: active.path.endsWith('.lab.md') ? ensureLabCellIds(content) : content,
      version: `eval-${++version}`,
    }
    return active
  }
  const runner: LabRunner = {
    get fileId() {
      return active?.fileId ?? ''
    },
    document: () =>
      active ? { version: active.version, cells: parseLabDocument(active.content).cells } : null,
    current: () => null,
    runtime: {
      getSnapshot: () => executions,
      stopCell: () => {},
      runCell: async cell => {
        if (cell.language !== 'typescript') throw new Error('This fixture runs TypeScript only.')
        const result = await typescriptRuntime.run(cell.source, () => {})
        executions.set(cell.id, {
          language: cell.language,
          source: cell.source,
          phase: result.error ? 'failed' : 'succeeded',
          progress: null,
          result,
        })
        return true
      },
    },
  }
  let graph = buildGraph([], new Map())
  const index = async () => {
    const files = await listStoredFiles()
    const notes = await Promise.all(
      files
        .filter(file => isNotePath(file.path))
        .map(async file => {
          const blob = await getStoredFileContent(file.id)
          return [file.id, parseNote((await blob?.text()) ?? '')] as const
        }),
    )
    graph = buildGraph(files, new Map(notes))
  }
  const local = createLocalTools(
    state,
    writeStoredTextFile,
    moveStoredFile,
    { get: () => active, replace },
    {
      state: () => ({ graph, progress: null }),
      file: () => undefined,
      dirty: () => false,
      read: async () => {
        throw new Error('Block naming is outside this fixture.')
      },
      update: async () => {
        throw new Error('Block naming is outside this fixture.')
      },
    },
    {
      active: () => (active?.path.endsWith('.lab.md') ? { path: active.path, runner } : null),
      runner: fileId => (fileId === active?.fileId ? runner : undefined),
    },
    undefined,
    async fileId => {
      const file = (await listStoredFiles()).find(file => file.id === fileId)
      const blob = await getStoredFileContent(fileId)
      if (!file || !blob) throw new Error('File not found.')
      savedContent = await blob.text()
      active = {
        fileId,
        path: file.path,
        content: file.path.endsWith('.lab.md') ? ensureLabCellIds(savedContent) : savedContent,
        version: `eval-${++version}`,
      }
      return state()
    },
  )
  const seed = async (path: string, content: string) => {
    // Node's Blob implementation survives fake-indexeddb's structured clone.
    const imported = await importStoredFiles(rootSources([new File([content], path)]), 'keep')
    const fileId = imported.addedIds[0]
    if (!fileId) throw new Error(`Could not seed ${path}`)
    await index()
    return fileId
  }
  return { local, seed, source: () => active, executions }
}

export type EvalWorkspace = ReturnType<typeof workspace>
