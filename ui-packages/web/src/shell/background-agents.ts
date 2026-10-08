import { type BackgroundAgent, pendingWork, runBackgroundAgent } from '../core/agent/background'
import { workspaceDatabaseName } from '../data/workspace-database'
import { abstractAgent, curatorAgent, tidyAgent } from '../features/memory'

// The agents that work on their own when a project opens. A new one is a line here.
export const backgroundAgents: readonly BackgroundAgent[] = [curatorAgent, tidyAgent, abstractAgent]

const ranKey = (projectKey: string) => `gamma-reader.background:${projectKey}`

// Once per project in a tab: a reload does not start them again, a new tab does.
export const runBackgroundAgentsOnOpen = async () => {
  const projectKey = workspaceDatabaseName()
  const key = ranKey(projectKey)
  try {
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, String(Date.now()))
  } catch (error) {
    console.error('Unable to note that background agents ran', error)
    return
  }
  // In order, each only when it has work: the curator's notes are what tidying and abstracting
  // look at.
  for (const agent of backgroundAgents)
    if ((await pendingWork(agent, projectKey)) > 0) await runBackgroundAgent(agent, projectKey)
}
