import type { ModelSelection } from '../../../core/conversations'
import { createModelRuntime } from '../../../core/models/model-runtime'
import { resolveModelSelection } from '../../../core/models/model-selection'
import { withWebSearch } from '../../assistant/web-tools'
import { attachAgent } from './agent-session'
import { queueDraft } from './drafts'
import { nextActivityTime, selectionFromState } from './session'
import { type Ctx, getActive, setActive } from './state'

export const configureModel = (ctx: Ctx, selection: ModelSelection) => {
  const { runtime, store } = ctx
  const { config, phase } = store.getState()
  const agent = runtime.agent
  if (!agent || phase !== 'ready' || runtime.busy || runtime.switching || config.kind !== 'enabled')
    return
  const state = resolveModelSelection(config.runtime, selection)
  const next = {
    ...getActive(ctx),
    selection: selectionFromState(state),
    lastActiveAt: nextActivityTime(getActive(ctx)),
  }
  agent.state.model = state.model
  agent.state.thinkingLevel = state.thinkingLevel
  setActive(ctx, next)
  void queueDraft(ctx, next, true)
}

// Takes effect from the next message; a reply already running keeps the tools it started with.
export const setWebSearch = (ctx: Ctx, on: boolean) => {
  const next = { ...getActive(ctx), webSearch: on }
  const agent = ctx.runtime.agent
  if (agent) agent.state.tools = withWebSearch(agent.state.tools, on)
  setActive(ctx, next)
  void queueDraft(ctx, next, true)
}

// Models a reader configured only reach the list once the runtime is rebuilt.
export const refreshProviders = async (ctx: Ctx) => {
  const current = ctx.store.getState().config
  if (current.kind !== 'enabled') return
  ctx.store.setState({
    config: {
      kind: 'enabled',
      runtime: await createModelRuntime(current.config),
      config: current.config,
    },
  })
  attachAgent(ctx, getActive(ctx), ctx.runtime.rawMessages)
}

// Turning memory on or off reaches the open conversation at once, unless a reply is running: that
// reply keeps the tools it started with, and the setting reaches the next conversation opened.
export const memoryChanged = (ctx: Ctx, memoryOn: boolean) => {
  const { runtime } = ctx
  if (runtime.memoryAttached === memoryOn) return
  runtime.memoryAttached = memoryOn
  if (!runtime.agent || runtime.busy || runtime.switching) return
  attachAgent(ctx, getActive(ctx), runtime.rawMessages)
}
