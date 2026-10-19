import { describe, expect, it } from 'vitest'
import { referencedFiles } from './file-mentions'

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
