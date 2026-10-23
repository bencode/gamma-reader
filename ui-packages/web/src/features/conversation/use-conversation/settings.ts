import type { ModelSelection } from '../../../core/conversations'
import { createModelRuntime } from '../../../core/models/model-runtime'
import { resolveModelSelection } from '../../../core/models/model-selection'
import { withWebSearch } from '../../assistant/web-tools'
import { attachAgent } from './agent-session'
import { queueDraft } from './drafts'
import { nextActivityTime, selectionFromState } from './session'
import { activeSession, type Ctx, getConversation, setConversation } from './state'

export const configureModel = (ctx: Ctx, selection: ModelSelection) => {
  const { config, switching } = ctx.store.getState()
  const s = activeSession(ctx)
  const { runtime, store } = s.session
  const agent = runtime.agent
  if (
    !agent ||
    store.getState().phase !== 'ready' ||
    runtime.busy ||
    switching ||
    config.kind !== 'enabled'
  )
    return
  const state = resolveModelSelection(config.runtime, selection)
  const current = getConversation(s)
  const next = {
    ...current,
    selection: selectionFromState(state),
    lastActiveAt: nextActivityTime(current),
  }
  agent.state.model = state.model
  agent.state.thinkingLevel = state.thinkingLevel
  setConversation(s, next)
  void queueDraft(s, next, true)
}

// Takes effect from the next message; a reply already running keeps the tools it started with.
export const setWebSearch = (ctx: Ctx, on: boolean) => {
  const s = activeSession(ctx)
  const next = { ...getConversation(s), webSearch: on }
  const agent = s.session.runtime.agent
  if (agent) agent.state.tools = withWebSearch(agent.state.tools, on)
  setConversation(s, next)
  void queueDraft(s, next, true)
}

// Models a reader configured only reach the list once the runtime is rebuilt. A conversation
// answering in the background keeps the models it started with.
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
  const s = activeSession(ctx)
  attachAgent(s, s.session.runtime.rawMessages)
}

// Turning memory on or off reaches the open conversation at once, unless a reply is running: that
// reply keeps the tools it started with, and the setting reaches the next conversation opened.
export const memoryChanged = (ctx: Ctx, memoryOn: boolean) => {
  const { runtime } = ctx
  if (runtime.memoryAttached === memoryOn) return
  runtime.memoryAttached = memoryOn
  if (ctx.store.getState().switching) return
  const s = activeSession(ctx)
  if (!s.session.runtime.agent || s.session.runtime.busy) return
  attachAgent(s, s.session.runtime.rawMessages)
}
