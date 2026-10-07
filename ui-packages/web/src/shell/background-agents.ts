import { workspaceDatabaseName } from '../data/workspace-database'
import { type BackgroundAgent, runBackgroundAgent } from '../features/agent/background'
import { curatorAgent } from '../features/memory'

// The agents that work on their own when a project opens. A new one is a line here.
export const backgroundAgents: readonly BackgroundAgent[] = [curatorAgent]

const ranKey = (projectKey: string) => `gamma-reader.background:${projectKey}`

// Once per project in a tab: a reload does not start them again, a new tab does.
export const runBackgroundAgentsOnOpen = async () => {
  const key = ranKey(workspaceDatabaseName())
  try {
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, String(Date.now()))
  } catch (error) {
    console.error('Unable to note that background agents ran', error)
    return
  }
  for (const agent of backgroundAgents) await runBackgroundAgent(agent)
}
