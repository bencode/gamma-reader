// What the assistant keeps about the reader. A reader entry is about the reader and follows them
// into every project; a project entry stays with the project it was saved in.
export type MemoryScope = 'reader' | 'project'

// A stretch of a conversation a note was drawn from, by message position, both ends included. A
// note about the reader gathers sources from every project, so each names its own.
export type MemoSource = { projectKey: string; conversationId: string; from: number; to: number }

export type MemoryEntry = {
  id: string
  // A statement that reads on its own: a fact the reader asked to keep, or a summary drawn from
  // conversations that points back to them through its sources.
  text: string
  scope: MemoryScope
  // Given to the assistant at the start of every conversation, such as how to answer.
  core: boolean
  // The database name of the project it was saved in, which names the project for its lifetime.
  projectKey: string
  conversationId: string
  createdAt: number
  // When its words or tags last changed, which is what tidying looks at.
  updatedAt: number
  // When it was saved, revised or last recalled.
  confirmedAt: number
  tags: string[]
  sources: MemoSource[]
  // The note tidying merged it into; it is kept, out of sight, so the merge can be undone.
  mergedInto?: string
  // The notes an abstraction was drawn from; such a note has no conversations of its own.
  derivedFrom?: string[]
}

// A word notes are filed under, with the other words the reader may use for it.
export type MemoryTag = { name: string; aliases: string[]; description: string }

// Notes saved before tags and sources existed read as having none, and a source saved before it
// named its project is in the note's own, the only one the curator read then.
export const normalizeEntry = (entry: MemoryEntry): MemoryEntry => ({
  ...entry,
  updatedAt: entry.updatedAt ?? entry.createdAt,
  tags: entry.tags ?? [],
  sources: (entry.sources ?? []).map(item => ({
    ...item,
    projectKey: item.projectKey ?? entry.projectKey,
  })),
})

// How many conversations a note was drawn from, however many stretches of each.
export const sourceConversations = (entry: MemoryEntry) =>
  new Set(entry.sources.map(item => `${item.projectKey}/${item.conversationId}`)).size

// The notes in use: a merged note stays only to be restored.
export const liveMemories = (entries: readonly MemoryEntry[]) =>
  entries.filter(entry => entry.mergedInto === undefined)

// The notes the assistant and the background agents work with in a project.
export const visibleMemories = (entries: readonly MemoryEntry[], projectKey: string) =>
  liveMemories(entries).filter(entry => entry.scope === 'reader' || entry.projectKey === projectKey)

const coreLimit = 10

export const coreMemories = (entries: readonly MemoryEntry[]) =>
  entries
    .filter(entry => entry.core && entry.scope === 'reader')
    .toSorted((a, b) => b.createdAt - a.createdAt)
    .slice(0, coreLimit)

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

// The tag a name stands for, by its own name or one of its aliases.
export const findTag = (tags: readonly MemoryTag[], name: string) =>
  tags.find(tag => sameName(tag.name, name) || tag.aliases.some(alias => sameName(alias, name)))
