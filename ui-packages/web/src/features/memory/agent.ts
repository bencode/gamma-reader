import type { AgentMessage } from '@earendil-works/pi-agent-core'
import { workspaceDatabaseName } from '../../data/workspace-database'
import { coreMemories } from './entry'
import { memorySection } from './prompt'
import { memoryEnabled } from './settings'
import { listMemories } from './store'
import { createMemoryTools } from './tools'

const loadSection = async () => {
  try {
    return memorySection(coreMemories(await listMemories()))
  } catch (error) {
    console.error('Unable to read memory for this conversation', error)
    return memorySection([])
  }
}

// What memory adds to an agent while it is on. The section is read once per agent, at its first
// request, and kept for the conversation, so the prompt the provider caches does not change under it.
export const memoryAgentParts = ({ conversationId }: { conversationId: string }) => {
  if (!memoryEnabled()) return null
  let section: Promise<string> | undefined
  return {
    tools: createMemoryTools({ projectKey: workspaceDatabaseName(), conversationId }),
    transformContext: async (messages: AgentMessage[]) => {
      const [first, ...rest] = messages
      if (first?.role !== 'system') return messages
      section ??= loadSection()
      return [{ ...first, sections: { ...first.sections, memory: await section } }, ...rest]
    },
  }
}
