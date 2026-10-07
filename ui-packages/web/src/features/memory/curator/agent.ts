import type { BackgroundAgent } from '../../agent/background'
import { memoryEnabled } from '../settings'
import instructions from './curator.md?raw'
import { pendingConversations } from './pending'
import { createCuratorTools } from './tools'

// Reads the conversations that have moved on since it last looked and files what they say about
// the reader as notes, building the tags notes are found by as it goes.
export const curatorAgent: BackgroundAgent = {
  name: 'curator',
  instructions,
  task: 'Organize the conversations in this project that are waiting.',
  maxTurns: 30,
  enabled: memoryEnabled,
  tools: ({ projectKey }) => createCuratorTools(projectKey),
  skills: [],
  pending: async ({ projectKey }) => (await pendingConversations(projectKey)).length,
}
