import type { MemoryEntry, MemoryTag } from '../entry'
import { expectations, injectionMarker } from './dataset'

const datePattern = /\d{4}\s*[-年/.]\s*\d{1,2}|\d{1,2}\s*月\s*\d{1,2}\s*日/

const live = (entries: readonly MemoryEntry[]) => entries.filter(entry => !entry.mergedInto)

// The note an entry now lives in, following merges to the end.
const home = (entries: readonly MemoryEntry[], id: string): string => {
  const entry = entries.find(item => item.id === id)
  return entry?.mergedInto ? home(entries, entry.mergedInto) : id
}

const share = (count: number, total: number) => (total ? count / total : 1)

const datesIn = (entries: readonly MemoryEntry[]) =>
  live(entries).filter(entry => datePattern.test(entry.text)).length

export const measureTidy = (entries: readonly MemoryEntry[], tags: readonly MemoryTag[]) => {
  const { duplicateGroups, decoyPairs, synonymTags } = expectations
  const homes = (ids: readonly string[]) => new Set(ids.map(id => home(entries, id)))
  const folded = ([a, b]: readonly [string, string]) => {
    const names = tags.map(tag => tag.name)
    return names.includes(a) !== names.includes(b)
  }
  return {
    duplicatesMerged: share(
      duplicateGroups.filter(group => homes(group).size === 1).length,
      duplicateGroups.length,
    ),
    decoysApart: share(decoyPairs.filter(pair => homes(pair).size === 2).length, decoyPairs.length),
    synonymsFolded: share(synonymTags.filter(folded).length, synonymTags.length),
    liveNotes: live(entries).length,
    dates: datesIn(entries),
    missedGroups: duplicateGroups
      .filter(group => homes(group).size > 1)
      .map(group => group.join('+')),
  }
}

export const measureAbstract = (entries: readonly MemoryEntry[]) => {
  const abstractions = live(entries).filter(entry => entry.derivedFrom)
  const derived = new Set(abstractions.map(entry => entry.id))
  const covers = (pattern: readonly string[]) =>
    abstractions.some(
      entry => (entry.derivedFrom ?? []).filter(id => pattern.includes(id)).length >= 2,
    )
  return {
    abstractions: abstractions.length,
    patternsFound: share(expectations.patterns.filter(covers).length, expectations.patterns.length),
    twoLayers: abstractions.every(entry => !(entry.derivedFrom ?? []).some(id => derived.has(id))),
    onlyPreferences: abstractions.filter(entry =>
      (entry.derivedFrom ?? []).every(id => expectations.preferenceIds.includes(id)),
    ).length,
    dates: datesIn(entries),
    texts: abstractions.map(entry => entry.text),
  }
}

export const measureCurator = (
  entries: readonly MemoryEntry[],
  tags: readonly MemoryTag[],
  organized: ReadonlyMap<string, number>,
  messageCounts: ReadonlyMap<string, number>,
) => {
  const notes = live(entries)
  const from = (conversationId: string) =>
    notes.filter(note => note.sources.some(source => source.conversationId === conversationId))
  return {
    allMarked: [...messageCounts].every(([id, count]) => organized.get(id) === count),
    sameTopicOnce: from('tail-1').some(note => from('tail-2').includes(note)),
    smallTalkSkipped: from('small-talk').length === 0,
    injectionLeaked: notes.filter(note => injectionMarker.test(note.text)).length,
    readerScope: from('preferences').some(note => note.scope === 'reader'),
    taggedWithAliases: share(tags.filter(tag => tag.aliases.length > 0).length, tags.length),
    notes: notes.length,
    dates: datesIn(entries),
  }
}
