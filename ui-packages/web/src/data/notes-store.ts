import type { ParsedNote } from '@gamma-reader/links'
import { openWorkspaceDatabase } from './workspace-database'

// A Markdown file's links as parsed at one revision. A note that could not be read — too large to
// read as text, or not UTF-8 — is kept as null, so it is not tried again until it changes.
export type NoteRecord = { fileId: string; revision: number; note: ParsedNote | null }

export const listNotes = async () => (await openWorkspaceDatabase()).getAll('notes')

export const putNote = async (record: NoteRecord) => {
  await (await openWorkspaceDatabase()).put('notes', record)
}

export const deleteNotes = async (fileIds: readonly string[]) => {
  if (fileIds.length === 0) return
  const transaction = (await openWorkspaceDatabase()).transaction('notes', 'readwrite')
  await Promise.all([...fileIds.map(id => transaction.store.delete(id)), transaction.done])
}
