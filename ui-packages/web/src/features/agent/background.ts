import { Agent } from '@earendil-works/pi-agent-core'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { loadModelConfig } from '../../config/model-config'
import { workspaceDatabaseName } from '../../data/workspace-database'
import { resolveModelSelection } from '../conversation/model-selection'
import { type AgentDefinition, assemble, streamFn } from './definition'
import { createModelRuntime, type ModelRuntime } from './model-runtime'

// The project an agent works on, and when it last finished a run there, so it can tell how much
// has changed since.
export type BackgroundContext = { projectKey: string; lastRunAt: number | null }

// An agent that works on its own, with no conversation: it is given one task per run and the
// tools to find its work, and stops when the work is done or its turns run out.
export type BackgroundAgent = AgentDefinition<BackgroundContext> & {
  task: string
  maxTurns: number
  enabled: () => boolean
  // How much work is waiting: nothing starts it when a project opens, and a run until done stops.
  pending: (context: BackgroundContext) => Promise<number>
}

export type BackgroundRun = {
  at: number
  turns: number
  tokens: number
  stoppedBy?: 'limit' | 'error'
  error?: string
}

type Status = { running: boolean; lastRun?: BackgroundRun }

const statusStore = createStore<Record<string, Status>>(() => ({}))
const setStatus = (name: string, status: Status) =>
  statusStore.setState(current => ({ ...current, [name]: status }))

// One idle status for every agent that has not run, so readers see a stable value.
const idle: Status = { running: false }

export const useBackgroundStatus = (name: string) =>
  useStore(statusStore, state => state[name] ?? idle)

const lastRunKey = (name: string, projectKey: string) =>
  `gamma-reader.agent-run:${name}:${projectKey}`

const readLastRun = (name: string, projectKey: string) => {
  try {
    const stored = Number(localStorage.getItem(lastRunKey(name, projectKey)))
    return stored > 0 ? stored : null
  } catch (error) {
    console.error('Unable to read when a background agent last ran', error)
    return null
  }
}

const writeLastRun = (name: string, projectKey: string, at: number) => {
  try {
    localStorage.setItem(lastRunKey(name, projectKey), String(at))
  } catch (error) {
    console.error('Unable to note when a background agent ran', error)
  }
}

export const backgroundContext = (agent: BackgroundAgent): BackgroundContext => {
  const projectKey = workspaceDatabaseName()
  return { projectKey, lastRunAt: readLastRun(agent.name, projectKey) }
}

// How much an agent has to do in the open project; nothing while it is turned off.
export const pendingWork = (agent: BackgroundAgent) =>
  agent.enabled() ? agent.pending(backgroundContext(agent)) : Promise.resolve(0)

let runtimePromise: Promise<ModelRuntime | null> | undefined

// The models chat offers; null where this deployment offers no chat.
const backgroundRuntime = () => {
  runtimePromise ??= loadModelConfig(new AbortController().signal)
    .then(config => (config.enabled ? createModelRuntime(config) : null))
    .catch(error => {
      runtimePromise = undefined
      throw error
    })
  return runtimePromise
}

const runOnce = async (
  agent: BackgroundAgent,
  runtime: ModelRuntime,
  context: BackgroundContext,
) => {
  // The default model, with no reasoning beyond what it requires.
  const { model, thinkingLevel } = resolveModelSelection(runtime)
  const instance = new Agent({
    sessionId: `${agent.name}-${Date.now()}`,
    toolExecution: 'sequential',
    initialState: { model, thinkingLevel, messages: [], ...assemble(agent, context) },
    streamFn,
  })
  const run: BackgroundRun = { at: Date.now(), turns: 0, tokens: 0 }
  instance.subscribe(event => {
    if (event.type === 'message_end' && event.message.role === 'assistant')
      run.tokens += event.message.usage.totalTokens
    // The turn cut short by the limit still ends; it is not counted again.
    if (event.type !== 'turn_end' || run.stoppedBy) return
    run.turns += 1
    if (run.turns >= agent.maxTurns) {
      run.stoppedBy = 'limit'
      instance.abort()
    }
  })
  await instance.prompt(agent.task)
  const reply = instance.state.messages.at(-1)
  if (reply?.role === 'assistant' && reply.stopReason === 'error') {
    run.stoppedBy = 'error'
    run.error = reply.errorMessage
  }
  return run
}

// One run, or runs one after another until no work is left; each run starts a fresh agent, so a
// long backlog never piles up in one context. Another tab running it on the same project wins.
export const runBackgroundAgent = async (
  agent: BackgroundAgent,
  { untilDone = false }: { untilDone?: boolean } = {},
) => {
  if (!agent.enabled()) return null
  const { projectKey } = backgroundContext(agent)
  return navigator.locks.request(
    `gamma-reader-agent:${agent.name}:${projectKey}`,
    { ifAvailable: true },
    async lock => {
      if (!lock) return null
      const runtime = await backgroundRuntime()
      if (!runtime) return null
      setStatus(agent.name, { ...statusStore.getState()[agent.name], running: true })
      // A run that ends without an error is noted when it ends, so what it changed itself does not
      // count as new work next time.
      const loop = async (before: number): Promise<BackgroundRun> => {
        const run = await runOnce(agent, runtime, backgroundContext(agent))
        if (run.stoppedBy !== 'error') writeLastRun(agent.name, projectKey, Date.now())
        setStatus(agent.name, { running: true, lastRun: run })
        if (!untilDone || run.stoppedBy === 'error') return run
        const after = await agent.pending(backgroundContext(agent))
        return after > 0 && after < before ? loop(after) : run
      }
      try {
        const run = await loop(await agent.pending(backgroundContext(agent)))
        setStatus(agent.name, { running: false, lastRun: run })
        return run
      } catch (error) {
        console.error(`Background agent ${agent.name} failed`, error)
        const run = {
          at: Date.now(),
          turns: 0,
          tokens: 0,
          stoppedBy: 'error' as const,
          error: error instanceof Error ? error.message : String(error),
        }
        setStatus(agent.name, { running: false, lastRun: run })
        return run
      }
    },
  )
}
