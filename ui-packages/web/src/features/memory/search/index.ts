import type { MemoryEntry } from '../entry'
import { tokenize } from './tokenize'

// Below this many entries a term's rarity says little, so every entry comes back, best match first,
// and the assistant reads them all.
const smallCorpus = 20

const newestFirst = (a: MemoryEntry, b: MemoryEntry) => b.confirmedAt - a.confirmedAt

// score is 0 for an entry that matched no query and came back only because the store is small.
export type MemoryHit = { entry: MemoryEntry; score: number }

// The index is built per search: a reader keeps hundreds of entries, which index in milliseconds.
export const searchMemories = async (
  entries: readonly MemoryEntry[],
  queries: readonly string[],
  limit: number,
): Promise<MemoryHit[]> => {
  const { default: MiniSearch } = await import('minisearch')
  const index = new MiniSearch<MemoryEntry>({
    fields: ['text'],
    tokenize,
    processTerm: term => term,
  })
  index.addAll(entries)
  const scores = new Map(
    index
      .search({ combineWith: 'OR', queries: [...queries] })
      .map(result => [result.id as string, result.score]),
  )
  const hits = entries
    .map(entry => ({ entry, score: scores.get(entry.id) ?? 0 }))
    .toSorted((a, b) => b.score - a.score || newestFirst(a.entry, b.entry))
  return entries.length <= smallCorpus ? hits : hits.filter(hit => hit.score > 0).slice(0, limit)
}
