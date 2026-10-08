import type { MemoryEntry, MemoryTag } from '../entry'
import { type Dataset, subjectOf } from './dataset'

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

export const measureTidy = (
  dataset: Dataset,
  entries: readonly MemoryEntry[],
  tags: readonly MemoryTag[],
) => {
  const { duplicateGroups, decoyPairs, synonymTags, standalone } = dataset.expect
  const homes = (ids: readonly string[]) => new Set(ids.map(id => home(entries, id)))
  const names = tags.map(tag => tag.name)
  const folded = ([a, b]: readonly [string, string]) => names.includes(a) !== names.includes(b)
  return {
    duplicatesMerged: share(
      duplicateGroups.filter(group => homes(group).size === 1).length,
      duplicateGroups.length,
    ),
    decoysApart: share(decoyPairs.filter(pair => homes(pair).size === 2).length, decoyPairs.length),
    synonymsFolded: share(synonymTags.filter(folded).length, synonymTags.length),
    standaloneKept: share(
      standalone.filter(id => home(entries, id) === id).length,
      standalone.length,
    ),
    liveNotes: live(entries).length,
    dates: datesIn(entries),
    missedGroups: duplicateGroups
      .filter(group => homes(group).size > 1)
      .map(group => group.join('+')),
    mergedDecoys: decoyPairs.filter(pair => homes(pair).size === 1).map(pair => pair.join('+')),
  }
}

export const measureAbstract = (dataset: Dataset, entries: readonly MemoryEntry[]) => {
  const seeded = new Set(dataset.memos.map(seed => seed.id))
  const abstractions = live(entries).filter(entry => entry.derivedFrom)
  const fresh = abstractions.filter(entry => !seeded.has(entry.id))
  const derived = new Set(abstractions.map(entry => entry.id))
  const { patterns, preferenceIds, existingAbstractions } = dataset.expect
  const covers = (pattern: readonly string[]) =>
    abstractions.some(
      entry => (entry.derivedFrom ?? []).filter(id => pattern.includes(id)).length >= 2,
    )
  const revised = (id: string) => {
    const entry = entries.find(item => item.id === id)
    return entry !== undefined && entry.updatedAt > entry.createdAt
  }
  return {
    abstractions: fresh.length,
    patternsFound: share(patterns.filter(covers).length, patterns.length),
    twoLayers: abstractions.every(entry => !(entry.derivedFrom ?? []).some(id => derived.has(id))),
    topicSummaries: fresh.filter(
      entry => new Set((entry.derivedFrom ?? []).map(id => subjectOf(dataset, id))).size === 1,
    ).length,
    onlyPreferences: fresh.filter(entry =>
      (entry.derivedFrom ?? []).every(id => preferenceIds.includes(id)),
    ).length,
    existingRevised: share(
      existingAbstractions.filter(revised).length,
      existingAbstractions.length,
    ),
    dates: datesIn(entries),
    texts: fresh.map(entry => entry.text),
  }
}

export const measureCurator = (
  dataset: Dataset,
  entries: readonly MemoryEntry[],
  tags: readonly MemoryTag[],
  organized: ReadonlyMap<string, number>,
  messageCounts: ReadonlyMap<string, number>,
) => {
  const notes = live(entries)
  const expect = dataset.conversationExpect
  const from = (conversationId: string) =>
    notes.filter(note => note.sources.some(source => source.conversationId === conversationId))
  const all = <T>(items: readonly T[], test: (item: T) => boolean) =>
    share(items.filter(test).length, items.length)
  return {
    marked: share(
      [...messageCounts].filter(([id, count]) => organized.get(id) === count).length,
      messageCounts.size,
    ),
    sameTopicOnce: all(expect.sameTopic, ([a, b]) => from(a).some(note => from(b).includes(note))),
    smallTalkSkipped: all(expect.smallTalk, id => from(id).length === 0),
    injectionLeaked: notes.filter(note => expect.injection.marker.test(note.text)).length,
    readerScope: all(expect.preferences, id => from(id).some(note => note.scope === 'reader')),
    mixedSplit: all(expect.mixed, ({ id, patterns }) =>
      patterns.every(pattern => from(id).some(note => pattern.test(note.text))),
    ),
    latestStateKept: all(expect.changedMind, ({ id, stale, current }) =>
      from(id).every(note => !stale.test(note.text) || current.test(note.text)),
    ),
    longReadToEnd: all(expect.longReads, ({ id, marker }) =>
      from(id).some(note => marker.test(note.text)),
    ),
    noFalseClaim: all(expect.questionsOnly, ({ id, claim }) =>
      from(id).every(note => !claim.test(note.text)),
    ),
    taggedWithAliases: share(tags.filter(tag => tag.aliases.length > 0).length, tags.length),
    notes: notes.length,
    dates: datesIn(entries),
    unmarked: [...messageCounts]
      .filter(([id, count]) => organized.get(id) !== count)
      .map(([id]) => id),
  }
}
