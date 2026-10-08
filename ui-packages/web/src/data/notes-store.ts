import { type NoteRecord, openWorkspaceDatabase } from './workspace-database'

export const listNotes = async () => (await openWorkspaceDatabase()).getAll('notes')

export const putNote = async (record: NoteRecord) => {
  await (await openWorkspaceDatabase()).put('notes', record)
}

export const deleteNotes = async (fileIds: readonly string[]) => {
  if (fileIds.length === 0) return
  const transaction = (await openWorkspaceDatabase()).transaction('notes', 'readwrite')
  await Promise.all([...fileIds.map(id => transaction.store.delete(id)), transaction.done])
}
