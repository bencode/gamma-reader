import { Agent } from '@earendil-works/pi-agent-core'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { loadModelConfig } from '../../config/model-config'
import { workspaceDatabaseName } from '../../data/workspace-database'
import { resolveModelSelection } from '../conversation/model-selection'
import { type AgentDefinition, assemble, streamFn } from './definition'
import { createModelRuntime, type ModelRuntime } from './model-runtime'

export type BackgroundContext = { projectKey: string }

// An agent that works on its own, with no conversation: it is given one task per run and the
// tools to find its work, and stops when the work is done or its turns run out.
export type BackgroundAgent = AgentDefinition<BackgroundContext> & {
  task: string
  maxTurns: number
  enabled: () => boolean
  // How much work is waiting, so a run until done knows when to stop.
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
// long backlog never piles up in one context. Another tab running the same agent wins.
export const runBackgroundAgent = async (
  agent: BackgroundAgent,
  { untilDone = false }: { untilDone?: boolean } = {},
) => {
  if (!agent.enabled()) return null
  const context = { projectKey: workspaceDatabaseName() }
  return navigator.locks.request(
    `gamma-reader-agent:${agent.name}`,
    { ifAvailable: true },
    async lock => {
      if (!lock) return null
      const runtime = await backgroundRuntime()
      if (!runtime) return null
      setStatus(agent.name, { ...statusStore.getState()[agent.name], running: true })
      const loop = async (before: number): Promise<BackgroundRun> => {
        const run = await runOnce(agent, runtime, context)
        setStatus(agent.name, { running: true, lastRun: run })
        if (!untilDone || run.stoppedBy === 'error') return run
        const after = await agent.pending(context)
        return after > 0 && after < before ? loop(after) : run
      }
      try {
        const run = await loop(await agent.pending(context))
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
