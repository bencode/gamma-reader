// What the assistant keeps about the reader. A reader entry is about the reader and follows them
// into every project; a project entry stays with the project it was saved in.
export type MemoryScope = 'reader' | 'project'

// A stretch of a conversation a note was drawn from, by message position, both ends included.
export type MemoSource = { conversationId: string; from: number; to: number }

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
  // When it was saved, revised or last recalled.
  confirmedAt: number
  tags: string[]
  sources: MemoSource[]
}

// A word notes are filed under, with the other words the reader may use for it.
export type MemoryTag = { name: string; aliases: string[]; description: string }

// Notes saved before tags and sources existed read as having none.
export const normalizeEntry = (entry: MemoryEntry): MemoryEntry => ({
  ...entry,
  tags: entry.tags ?? [],
  sources: entry.sources ?? [],
})

export const visibleMemories = (entries: readonly MemoryEntry[], projectKey: string) =>
  entries.filter(entry => entry.scope === 'reader' || entry.projectKey === projectKey)

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
