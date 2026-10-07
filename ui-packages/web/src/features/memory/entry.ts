// What the reader asked the assistant to remember. A reader entry is about the reader and follows
// them into every project; a project entry stays with the project it was saved in.
export type MemoryScope = 'reader' | 'project'

export type MemoryEntry = {
  id: string
  // A statement that reads on its own, without the conversation it came from.
  text: string
  scope: MemoryScope
  // Given to the assistant at the start of every conversation, such as how to answer.
  core: boolean
  // The database name of the project it was saved in, which names the project for its lifetime.
  projectKey: string
  conversationId: string
  createdAt: number
  // When it was saved or last recalled.
  confirmedAt: number
}

export const visibleMemories = (entries: readonly MemoryEntry[], projectKey: string) =>
  entries.filter(entry => entry.scope === 'reader' || entry.projectKey === projectKey)

const coreLimit = 10

export const coreMemories = (entries: readonly MemoryEntry[]) =>
  entries
    .filter(entry => entry.core && entry.scope === 'reader')
    .toSorted((a, b) => b.createdAt - a.createdAt)
    .slice(0, coreLimit)
