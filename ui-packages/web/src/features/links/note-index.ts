import { buildGraph, isNotePath, type LinkGraph, type ParsedNote } from '@gamma-reader/links'
import { maximumTextPreviewBytes, type StoredFileMetadata } from '../../core/files'
import type { NoteRecord } from '../../data/notes-store'

type LibraryFile = Pick<StoredFileMetadata, 'id' | 'path' | 'revision' | 'size' | 'collection'>

export type IndexPlan = { parse: LibraryFile[]; remove: string[] }

export type IndexProgress = { done: number; total: number }

// The graph once indexed, and how far a run that is still going has come.
export type NoteIndexState = { graph: LinkGraph | null; progress: IndexProgress | null }

const inLibrary = (file: LibraryFile) => (file.collection ?? 'files') === 'files'

// What the cache lacks: a Markdown file never parsed or changed since, and records of files that
// are gone. A moved file keeps its revision, so its record still holds.
export const planIndex = (
  files: readonly LibraryFile[],
  records: readonly NoteRecord[],
): IndexPlan => {
  const cached = new Map(records.map(record => [record.fileId, record.revision]))
  const notes = files.filter(file => inLibrary(file) && isNotePath(file.path))
  const present = new Set(notes.map(file => file.id))
  return {
    parse: notes.filter(file => cached.get(file.id) !== file.revision),
    remove: records.filter(record => !present.has(record.fileId)).map(record => record.fileId),
  }
}

export type IndexSteps = {
  read: (fileId: string) => Promise<Blob | null>
  parse: (blob: Blob) => Promise<ParsedNote | null>
  store: (record: NoteRecord) => Promise<void>
  remove: (fileIds: readonly string[]) => Promise<void>
  onProgress: (progress: IndexProgress) => void
  signal: AbortSignal
}

// One file at a time, each stored as soon as it is parsed, so a run stopped by a newer one keeps
// what it finished. A file too large to read as text is recorded without a note; one that left
// the library meanwhile is skipped.
export const runIndex = async (plan: IndexPlan, steps: IndexSteps) => {
  steps.signal.throwIfAborted()
  await steps.remove(plan.remove)
  const total = plan.parse.length
  steps.onProgress({ done: 0, total })
  for (const [index, file] of plan.parse.entries()) {
    steps.signal.throwIfAborted()
    const tooLarge = file.size > maximumTextPreviewBytes
    const blob = tooLarge ? null : await steps.read(file.id)
    if (tooLarge || blob) {
      const note = blob ? await steps.parse(blob) : null
      steps.signal.throwIfAborted()
      await steps.store({ fileId: file.id, revision: file.revision, note })
    }
    steps.onProgress({ done: index + 1, total })
  }
}

// The graph over every library file, linked from the notes that could be read.
export const graphOf = (files: readonly LibraryFile[], records: readonly NoteRecord[]) =>
  buildGraph(
    files.filter(inLibrary),
    new Map(records.flatMap(record => (record.note ? [[record.fileId, record.note]] : []))),
  )
