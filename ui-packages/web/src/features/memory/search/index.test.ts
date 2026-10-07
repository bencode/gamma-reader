import { describe, expect, it } from 'vitest'
import type { MemoryEntry } from '../entry'
import { type MemoryHit, searchMemories } from '.'

const entry = (id: string, text: string, confirmedAt = 0): MemoryEntry => ({
  id,
  text,
  scope: 'reader',
  core: false,
  projectKey: 'project',
  conversationId: 'conversation',
  createdAt: 0,
  confirmedAt,
})

const filler = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    entry(`filler-${index}`, `第 ${index} 次散步的天气记录`),
  )

const ids = (hits: readonly MemoryHit[]) => hits.map(hit => hit.entry.id)

describe('searchMemories', () => {
  const corpus = [
    entry('closure', '读者理解了闭包，但尾递归还不熟'),
    entry('sicp', 'The reader is working through SICP section 1.2 on iterative processes'),
    entry('style', '读者喜欢简短的中文回答'),
    ...filler(30),
  ]

  it('finds Chinese terms the word segmenter would split apart', async () => {
    expect(ids(await searchMemories(corpus, ['尾递归'], 5))[0]).toBe('closure')
    expect(ids(await searchMemories(corpus, ['闭包'], 5))[0]).toBe('closure')
  })

  it('merges queries in either language', async () => {
    const found = ids(await searchMemories(corpus, ['SICP iterative', '回答风格'], 5))
    expect(found).toEqual(expect.arrayContaining(['sicp', 'style']))
    expect(found).not.toContain('closure')
  })

  it('returns nothing from a large store when no query matches', async () => {
    expect(await searchMemories(corpus, ['photosynthesis'], 5)).toEqual([])
  })

  it('returns every entry of a small store, matches first', async () => {
    const small = [entry('old', 'Prefers metric units', 2), entry('match', '尾递归的例子', 1)]
    expect(ids(await searchMemories(small, ['尾递归'], 1))).toEqual(['match', 'old'])
  })
})
