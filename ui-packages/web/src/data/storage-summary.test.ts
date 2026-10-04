import { describe, expect, it } from 'vitest'
import { emptyConversationDraft } from '../core/conversations'
import { rootSources } from '../core/files'
import { saveStoredConversationDraft } from './conversation-store'
import { importStoredFiles, listStoredFiles } from './file-store'
import { readStorageSummary } from './storage-summary'

describe('storage summary', () => {
  it('counts every table of the open project and sums the stored file bytes', async () => {
    await importStoredFiles(
      rootSources([new File(['# Notes'], 'Notes.md', { type: 'text/markdown' })]),
      'keep',
    )
    await saveStoredConversationDraft({
      id: 'conversation',
      title: null,
      draft: emptyConversationDraft(),
      createdAt: 1,
      lastActiveAt: 1,
    })
    const files = await listStoredFiles()

    const summary = await readStorageSummary()

    expect(Object.fromEntries(summary.stores.map(store => [store.name, store.records]))).toEqual({
      contents: files.length,
      conversations: 1,
      files: files.length,
      folderExports: 0,
      messages: 0,
      notes: 0,
    })
    expect(summary.fileBytes).toBe(files.reduce((total, file) => total + file.size, 0))
  })
})
