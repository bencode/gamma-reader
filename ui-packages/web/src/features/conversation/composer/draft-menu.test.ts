import { describe, expect, it } from 'vitest'
import { emptyConversationDraft } from '../../../core/conversations'
import { composerMenu, menuQuery } from './draft-menu'

const sources = {
  commands: [{ name: 'compact', description: 'Summarize', run: () => undefined }],
  files: [{ id: 'notes', path: 'guide/notes.md', previewKind: 'markdown' as const }],
  recentFileIds: [],
  conversations: [
    {
      id: 'k3X9qA-id',
      title: 'Chapter one',
      draft: emptyConversationDraft(),
      createdAt: 1,
      lastActiveAt: 1,
    },
  ],
  activeConversationId: 'active-id',
}

const menuFor = (command: string, draft: string, caret: number | null = draft.length) =>
  composerMenu(menuQuery(command, draft, caret), sources)

describe('composer menu', () => {
  it('offers commands, files after @ and conversations after #, and nothing else', () => {
    expect(menuFor('/com', '')).toEqual({ kind: 'command', commands: sources.commands })
    expect(menuFor('', 'read @no')).toMatchObject({
      kind: 'mention',
      label: 'Files',
      mention: { start: 5, query: 'no' },
      tokens: ['@guide/notes.md'],
    })
    expect(menuFor('', 'see #chap')).toMatchObject({
      kind: 'mention',
      label: 'Conversations',
      tokens: ['#k3X9qA'],
    })
    expect(menuFor('', 'look at #3')).toBeNull()
    expect(menuFor('', 'read @nothing-like-this')).toBeNull()
    expect(menuFor('', 'read @no', null)).toBeNull()
  })
})
