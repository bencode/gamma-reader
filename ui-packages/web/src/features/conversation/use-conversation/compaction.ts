import type { Agent, AgentMessage } from '@earendil-works/pi-agent-core'
import { isContextOverflow } from '@earendil-works/pi-ai'
import { autoCompactionEnabled, needsCompaction } from '../../../core/agent/compaction'
import { compactConversation } from '../../assistant/compaction'
import { conversationMessages } from '../../assistant/create-reader-agent'
import { persistAgentMessages, refresh } from './agent-session'
import { activeSession, type Ctx, type SessionCtx } from './state'

// The summary is appended like any message, so the conversation is saved whole and the provider
// is sent the summary and what it kept from the next request on. A failed call throws.
const summarize = async (s: SessionCtx, agent: Agent) => {
  const { runtime, store } = s.session
  const controller = new AbortController()
  runtime.compaction = controller
  store.setState({ phase: 'compacting' })
  try {
    const message = await compactConversation(
      agent.state.model,
      conversationMessages(agent),
      controller.signal,
    )
    if (runtime.agent !== agent || controller.signal.aborted) return 'aborted'
    if (!message) return 'nothing'
    agent.state.messages = [...agent.state.messages, message]
    refresh(s, agent)
    await persistAgentMessages(s, agent)
    if (runtime.agent !== agent || controller.signal.aborted) return 'aborted'
    return 'compacted'
  } catch (cause) {
    if (runtime.agent !== agent || controller.signal.aborted) return 'aborted'
    throw cause
  } finally {
    if (runtime.compaction === controller) runtime.compaction = null
  }
}

// The reader's /compact, on the open conversation.
export const compact = async (ctx: Ctx) => {
  if (ctx.store.getState().switching) return
  const s = activeSession(ctx)
  const { runtime, store } = s.session
  const agent = runtime.agent
  if (!agent || runtime.busy) return
  runtime.busy = true
  store.setState({ error: undefined })
  try {
    if ((await summarize(s, agent)) === 'nothing')
      store.setState({
        error: 'Nothing to compact yet: the conversation still fits in its recent context.',
      })
  } catch (cause) {
    if (runtime.agent !== agent) return
    console.error('Unable to compact the conversation', cause)
    store.setState({
      error: cause instanceof Error ? cause.message : 'Could not compact the conversation.',
    })
  } finally {
    if (runtime.agent === agent) {
      runtime.busy = false
      store.setState({ phase: 'ready' })
    }
  }
}

// Before a message is sent into a context past the threshold. False when the reader stopped it;
// a failure sends the message anyway and leaves an overflow to recoverFromOverflow.
export const compactBeforeSending = async (
  s: SessionCtx,
  agent: Agent,
  sending: readonly AgentMessage[],
) => {
  const { model } = agent.state
  if (!needsCompaction([...agent.state.messages, ...sending], model.contextWindow)) return true
  try {
    return (await summarize(s, agent)) !== 'aborted'
  } catch (cause) {
    console.error('Unable to compact the conversation before sending', cause)
    return true
  }
}

// A reply refused for its context length is answered again, once, after compacting what came
// before it. The failed reply stays in the transcript; the provider is never sent it again.
export const recoverFromOverflow = async (s: SessionCtx, agent: Agent) => {
  const last = agent.state.messages.at(-1)
  if (
    !autoCompactionEnabled(agent.state.model.contextWindow) ||
    last?.role !== 'assistant' ||
    last.stopReason !== 'error' ||
    !isContextOverflow(last, agent.state.model.contextWindow)
  )
    return
  try {
    if ((await summarize(s, agent)) !== 'compacted') return
  } catch (cause) {
    console.error('Unable to compact the conversation after it overflowed', cause)
    return
  }
  s.session.store.setState({ phase: 'running' })
  await agent.continue()
}
