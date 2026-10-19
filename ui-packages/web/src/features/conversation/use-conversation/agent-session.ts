import type { Agent, AgentMessage } from '@earendil-works/pi-agent-core'
import { conversationTitle, foldQueued, type StoredConversation } from '../../../core/conversations'
import { resolveModelSelection } from '../../../core/models/model-selection'
import { createReaderUserMessage, isReaderUserMessage } from '../../../core/reader-message'
import { appendStoredConversationMessages } from '../../../data/conversation-store'
import { conversationMessages, createReaderAgent } from '../../assistant/create-reader-agent'
import { withWebSearch } from '../../assistant/web-tools'
import { tokenUsage } from '../token-usage'
import { currentDraft, queueDraft, takeQueued, updateActiveDraft } from './drafts'
import { placeFirst } from './history'
import { displayMessages, runContinues, statusMap } from './messages'
import {
  activeConversationKey,
  nextActivityTime,
  selectionFromState,
  webSearchAvailable,
} from './session'
import { type Ctx, getActive, reportStorageError, setActive } from './state'

export const refresh = (ctx: Ctx, agent: Agent) => {
  ctx.runtime.rawMessages = conversationMessages(agent)
  const all = agent.state.streamingMessage
    ? [...ctx.runtime.rawMessages, agent.state.streamingMessage]
    : ctx.runtime.rawMessages
  ctx.store.setState({
    messages: displayMessages(all, ctx.runtime.statuses),
    usage: tokenUsage(ctx.runtime.rawMessages),
  })
}

export const persistAgentMessages = async (ctx: Ctx, agent: Agent) => {
  const pending = conversationMessages(agent).slice(ctx.runtime.persistedMessageCount)
  if (!pending.length) return
  const current = getActive(ctx)
  const firstUser = pending.find(isReaderUserMessage)
  const next = {
    ...current,
    title:
      current.title ??
      (firstUser
        ? conversationTitle({
            text: firstUser.reader.text,
            attachments: firstUser.reader.attachments,
          })
        : null),
    lastActiveAt: nextActivityTime(current),
  }
  setActive(ctx, next)
  try {
    await appendStoredConversationMessages({
      conversation: next,
      startPosition: ctx.runtime.persistedMessageCount,
      messages: pending,
    })
    ctx.runtime.persistedMessageCount += pending.length
    placeFirst(ctx, next)
    localStorage.setItem(activeConversationKey(), next.id)
    ctx.store.setState({ storageError: undefined })
  } catch (cause) {
    reportStorageError(ctx, cause)
  }
}

export const disposeAgent = async (ctx: Ctx, saveDraft: boolean) => {
  const { runtime } = ctx
  const agent = runtime.agent
  // Taken before stopping, so the run does not send it to an agent about to be dropped.
  const queued = takeQueued(ctx)
  runtime.compaction?.abort()
  if (agent?.state.isStreaming) agent.abort()
  if (agent) await agent.waitForIdle()
  await ctx.attachments.settle()
  if (saveDraft) {
    updateActiveDraft(ctx, foldQueued(currentDraft(ctx), queued))
    await queueDraft(ctx, getActive(ctx))
  }
  await ctx.drafts.idle()
  runtime.unsubscribe?.()
  runtime.unsubscribe = null
  runtime.agent = null
  runtime.busy = false
}

// Shows the stored messages at once; the agent follows when the model configuration is known.
export const attachAgent = (
  ctx: Ctx,
  conversation: StoredConversation,
  storedMessages: readonly AgentMessage[],
) => {
  const { runtime, store } = ctx
  const configState = store.getState().config
  runtime.rawMessages = [...storedMessages]
  runtime.persistedMessageCount = storedMessages.length
  runtime.statuses = statusMap(storedMessages)
  store.setState({
    messages: displayMessages(storedMessages, runtime.statuses),
    usage: tokenUsage(storedMessages),
  })
  if (configState.kind === 'loading') return store.setState({ phase: 'connecting' })
  if (configState.kind === 'unavailable') return store.setState({ phase: 'unavailable' })
  if (configState.kind === 'error')
    return store.setState({ error: configState.message, phase: 'error' })
  let agent: Agent
  try {
    const state = resolveModelSelection(configState.runtime, conversation.selection)
    agent = createReaderAgent(configState.runtime, ctx.tools, {
      id: conversation.id,
      messages: storedMessages,
      ...state,
      web: () =>
        !webSearchAvailable(store.getState().config)
          ? 'unavailable'
          : getActive(ctx).webSearch
            ? 'on'
            : 'off',
      onCompactionChange: compacting => {
        if (runtime.agent !== agent || runtime.switching) return
        const { phase } = store.getState()
        if (compacting && phase === 'running') store.setState({ phase: 'compacting' })
        if (!compacting && phase === 'compacting') store.setState({ phase: 'running' })
      },
    })
    agent.state.tools = withWebSearch(
      agent.state.tools,
      webSearchAvailable(configState) && Boolean(conversation.webSearch),
    )
    setActive(ctx, { ...conversation, selection: selectionFromState(state) })
  } catch (cause) {
    console.error('Unable to initialize chat', cause)
    store.setState({
      error: cause instanceof Error ? cause.message : 'Could not initialize chat.',
      phase: 'error',
    })
    return
  }
  runtime.agent = agent
  runtime.unsubscribe = agent.subscribe(async (event, signal) => {
    if (event.type === 'turn_end' && !signal.aborted && runContinues(event.message))
      takeQueued(ctx).forEach(item => {
        agent.steer(createReaderUserMessage(item.text, item.attachments, item.references))
      })
    if (event.type === 'tool_execution_start') runtime.statuses.set(event.toolCallId, 'Running')
    if (event.type === 'tool_execution_end')
      runtime.statuses.set(
        event.toolCallId,
        signal.aborted ? 'Stopped' : event.isError ? 'Failed' : 'Completed',
      )
    refresh(ctx, agent)
    if (event.type === 'message_end') await persistAgentMessages(ctx, agent)
  })
  store.setState({ error: undefined, phase: 'ready' })
}

export const showSession = (
  ctx: Ctx,
  conversation: StoredConversation,
  storedMessages: readonly AgentMessage[],
) => {
  setActive(ctx, conversation)
  ctx.store.setState({ draft: conversation.draft.text })
  ctx.attachments.replaceReady(conversation.draft.attachments)
  attachAgent(ctx, conversation, storedMessages)
}
