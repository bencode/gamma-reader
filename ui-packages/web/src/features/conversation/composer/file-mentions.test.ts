import { describe, expect, it } from 'vitest'
import { rankMentions, referencedFiles } from './file-mentions'

const files = [
  { id: 'notes', path: 'notes.md' },
  { id: 'backup', path: 'notes.md.bak' },
  { id: 'start', path: 'docs/Start here.md' },
]

describe('referencedFiles', () => {
  it('names each file once, taking the longest path an @ goes on with', () => {
    const text = '@notes.md.bak vs @docs/Start here.md, and again @notes.md.bak'
    expect(referencedFiles(text, files).map(file => file.id)).toEqual(['backup', 'start'])
  })

  it('takes an @ after Chinese text or punctuation, but not one inside an email address', () => {
    expect(
      referencedFiles('另外，@notes.md 和看看@notes.md.bak', files).map(file => file.id),
    ).toEqual(['notes', 'backup'])
    expect(referencedFiles('mail me at me@notes.md', files)).toEqual([])
  })
})

describe('rankMentions', () => {
  const library = [
    { id: 'folder', path: 'notes/plan.md' },
    { id: 'field', path: 'Field notes.docx' },
    { id: 'other', path: 'zeta.md' },
    { id: 'notes', path: 'notes.md' },
    { id: 'todo', path: 'notes-todo.md' },
  ]
  const ids = (query: string, recent: string[] = []) =>
    rankMentions(library, query, recent).map(file => file.id)

  it('puts names starting with the query before names holding it, and those before folders', () => {
    expect(ids('Notes')).toEqual(['todo', 'notes', 'field', 'folder'])
  })

  it('lets recently opened files lead their rank, and a bare @ lead with them', () => {
    expect(ids('notes', ['notes'])).toEqual(['notes', 'todo', 'field', 'folder'])
    expect(ids('', ['other', 'field'])).toEqual(['other', 'field', 'todo', 'notes', 'folder'])
  })
})
