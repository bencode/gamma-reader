import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { MemoryEntry, MemoryScope, MemoryTag } from '../entry'

// The project an evaluation runs in, as tests name the open one.
export const projectKey = 'gamma-reader-files'

// A note as a dataset writes it; one with derivedFrom is an abstraction already drawn.
export type Seed = {
  id: string
  text: string
  tags: string[]
  scope?: MemoryScope
  project?: string
  derivedFrom?: string[]
}

export type Dataset = {
  name: string
  tags: MemoryTag[]
  memos: Seed[]
  // The subject each tag belongs to, so an abstraction can be told from a summary of one subject.
  subjectOfTag: Record<string, string>
  expect: {
    duplicateGroups: string[][]
    decoyPairs: (readonly [string, string])[]
    synonymTags: (readonly [string, string])[]
    patterns: string[][]
    preferenceIds: string[]
    // Notes on more than one thing, which no merge should swallow.
    standalone: string[]
    // Abstractions already drawn, which a new run should revise rather than repeat.
    existingAbstractions: string[]
  }
  conversations: { id: string; messages: AgentMessage[] }[]
  conversationExpect: {
    sameTopic: (readonly [string, string])[]
    smallTalk: string[]
    injection: { ids: string[]; marker: RegExp }
    mixed: { id: string; patterns: RegExp[] }[]
    changedMind: { id: string; stale: RegExp; current: RegExp }[]
    longReads: { id: string; marker: RegExp }[]
    // Conversations that only asked, which no note should turn into understanding.
    questionsOnly: { id: string; claim: RegExp }[]
    preferences: string[]
  }
}

export const tag = (name: string, aliases: string[], description: string): MemoryTag => ({
  name,
  aliases,
  description,
})

export const subjectOf = (dataset: Dataset, id: string) => {
  const seed = dataset.memos.find(item => item.id === id)
  return seed?.tags.map(name => dataset.subjectOfTag[name]).find(Boolean) ?? 'unknown'
}

// The notes as tidying should leave them: one per duplicate group, the last and most current.
export const tidiedIds = (dataset: Dataset) =>
  dataset.memos
    .map(seed => seed.id)
    .filter(
      id =>
        !dataset.expect.duplicateGroups.some(group => group.includes(id) && group.at(-1) !== id),
    )

const day = 24 * 60 * 60 * 1000

export const memoEntry = (seed: Seed, index: number): MemoryEntry => {
  const at = Date.now() - 3 * day + index * 1000
  const home = seed.project ?? projectKey
  return {
    id: seed.id,
    text: seed.text,
    scope: seed.scope ?? 'project',
    core: false,
    projectKey: home,
    conversationId: `c-${seed.id}`,
    createdAt: at,
    updatedAt: at,
    confirmedAt: at,
    tags: seed.tags,
    sources: seed.derivedFrom
      ? []
      : [{ projectKey: home, conversationId: `c-${seed.id}`, from: 0, to: 3 }],
    ...(seed.derivedFrom && { derivedFrom: seed.derivedFrom }),
  }
}
