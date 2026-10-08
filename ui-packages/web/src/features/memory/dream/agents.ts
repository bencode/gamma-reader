import type { BackgroundAgent, BackgroundContext } from '../../agent/background'
import { visibleNotes } from '../memo-tools'
import { memoryEnabled } from '../settings'
import abstractInstructions from './abstract.md?raw'
import tidyInstructions from './tidy.md?raw'
import { createAbstractTools, createTidyTools } from './tools'

const day = 24 * 60 * 60 * 1000

// Tidying waits for enough notes to have changed, and for a day since it last looked.
export const tidyDue = (changed: number, { lastRunAt }: BackgroundContext, now = Date.now()) =>
  changed >= 5 && (lastRunAt === null || now - lastRunAt > day) ? changed : 0

// Abstracting needs material: many new notes, or some after a week.
export const abstractDue = (added: number, { lastRunAt }: BackgroundContext, now = Date.now()) =>
  added >= 10 || (added >= 1 && (lastRunAt === null || now - lastRunAt > 7 * day)) ? added : 0

export const tidyAgent: BackgroundAgent = {
  name: 'tidy',
  instructions: tidyInstructions,
  task: 'Tidy the notes about the reader and this project.',
  maxTurns: 40,
  enabled: memoryEnabled,
  tools: ({ projectKey, lastRunAt }) => createTidyTools(projectKey, lastRunAt),
  skills: [],
  pending: async context => {
    const notes = await visibleNotes(context.projectKey)
    return tidyDue(notes.filter(note => note.updatedAt > (context.lastRunAt ?? 0)).length, context)
  },
}

export const abstractAgent: BackgroundAgent = {
  name: 'abstract',
  instructions: abstractInstructions,
  task: 'Draw abstractions from the notes about the reader and this project.',
  maxTurns: 20,
  enabled: memoryEnabled,
  tools: ({ projectKey, lastRunAt }) => createAbstractTools(projectKey, lastRunAt),
  skills: [],
  pending: async context => {
    const notes = await visibleNotes(context.projectKey)
    const added = notes.filter(
      note => !note.derivedFrom && note.createdAt > (context.lastRunAt ?? 0),
    ).length
    return abstractDue(added, context)
  },
}
