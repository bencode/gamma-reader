import { findTag, type MemoryEntry, type MemoryTag } from '../entry'
import { tokenize } from './tokenize'

// Below this many entries a term's rarity says little, so every entry comes back, best match first,
// and the assistant reads them all.
const smallCorpus = 20

const newestFirst = (a: MemoryEntry, b: MemoryEntry) => b.confirmedAt - a.confirmedAt

// score is 0 for an entry that matched no query and came back only because the store is small.
export type MemoryHit = { entry: MemoryEntry; score: number }

// A note is found by its tags and by every other word those tags go by, weighted above its text.
const tagWords = (entry: MemoryEntry, tags: readonly MemoryTag[]) =>
  entry.tags
    .flatMap(name => {
      const tag = findTag(tags, name)
      return tag ? [tag.name, ...tag.aliases] : [name]
    })
    .join(' ')

// The index is built per search: a reader keeps hundreds of entries, which index in milliseconds.
export const searchMemories = async (
  entries: readonly MemoryEntry[],
  queries: readonly string[],
  limit: number,
  tags: readonly MemoryTag[],
): Promise<MemoryHit[]> => {
  const { default: MiniSearch } = await import('minisearch')
  const index = new MiniSearch<MemoryEntry>({
    fields: ['text', 'tags'],
    extractField: (entry, field) =>
      field === 'tags' ? tagWords(entry, tags) : String(entry[field as keyof MemoryEntry] ?? ''),
    tokenize,
    processTerm: term => term,
    searchOptions: { boost: { tags: 2 } },
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
