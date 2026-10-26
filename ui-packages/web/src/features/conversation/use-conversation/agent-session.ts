import type { Agent, AgentMessage } from '@earendil-works/pi-agent-core'
import type { Api, Model } from '@earendil-works/pi-ai'
import type { StoreApi } from 'zustand/vanilla'
import {
  conversationTitle,
  type ModelSelection,
  type StoredConversation,
} from '../../../core/conversations'
import { isUserProvider } from '../../../core/models/byok/runtime'
import { resolveModelSelection } from '../../../core/models/model-selection'
import { createReaderUserMessage, isReaderUserMessage } from '../../../core/reader-message'
import { appendStoredConversationMessages } from '../../../data/conversation-store'
import { conversationMessages, createReaderAgent } from '../../assistant/create-reader-agent'
import { withWebSearch } from '../../assistant/web-tools'
import { tokenUsage } from '../token-usage'
import { createDraftQueue } from './draft-queue'
import { takeQueued, writeDraft } from './drafts'
import { placeFirst } from './history'
import { displayMessages, runContinues, statusMap } from './messages'
import {
  activeConversationKey,
  nextActivityTime,
  selectionFromState,
  webSearchAvailable,
} from './session'
import {
  type Ctx,
  createSessionRuntime,
  createSessionStore,
  getConversation,
  isActive,
  reportStorageError,
  type SessionCtx,
  type SessionState,
  setConversation,
} from './state'

export const refresh = (s: SessionCtx, agent: Agent) => {
  const { runtime, store } = s.session
  runtime.rawMessages = conversationMessages(agent)
  const all = agent.state.streamingMessage
    ? [...runtime.rawMessages, agent.state.streamingMessage]
    : runtime.rawMessages
  store.setState({
    messages: displayMessages(all, runtime.statuses),
    usage: tokenUsage(runtime.rawMessages),
  })
}

export const persistAgentMessages = async (s: SessionCtx, agent: Agent) => {
  const { runtime } = s.session
  const pending = conversationMessages(agent).slice(runtime.persistedMessageCount)
  if (!pending.length) return
  const current = getConversation(s)
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
  setConversation(s, next)
  try {
    await appendStoredConversationMessages({
      conversation: next,
      startPosition: runtime.persistedMessageCount,
      messages: pending,
    })
    runtime.persistedMessageCount += pending.length
    placeFirst(s.app, next)
    if (isActive(s)) localStorage.setItem(activeConversationKey(), next.id)
    s.app.store.setState({ storageError: undefined })
  } catch (cause) {
    reportStorageError(s.app, cause)
  }
}

// Stops the conversation's reply, if one is running, and lets go of its agent.
export const disposeAgent = async (s: SessionCtx) => {
  const { runtime } = s.session
  const agent = runtime.agent
  runtime.compaction?.abort()
  if (agent?.state.isStreaming) agent.abort()
  if (agent) await agent.waitForIdle()
  await s.session.drafts.idle()
  runtime.unsubscribe?.()
  runtime.unsubscribe = null
  runtime.agent = null
  runtime.busy = false
}

// Shows the stored messages at once; the agent follows when the model configuration is known.
export const attachAgent = (s: SessionCtx, storedMessages: readonly AgentMessage[]) => {
  const { runtime, store } = s.session
  const conversation = getConversation(s)
  const configState = s.app.store.getState().config
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
  let notice: string | undefined
  try {
    const state = resolveModelSelection(configState.runtime, conversation.selection)
    notice = lostOwnModel(conversation.selection, state.model)
    agent = createReaderAgent(configState.runtime, s.app.tools, {
      id: conversation.id,
      messages: storedMessages,
      ...state,
      web: () =>
        !webSearchAvailable(s.app.store.getState().config)
          ? 'unavailable'
          : getConversation(s).webSearch
            ? 'on'
            : 'off',
      onCompactionChange: compacting => {
        if (runtime.agent !== agent) return
        const { phase } = store.getState()
        if (compacting && phase === 'running') store.setState({ phase: 'compacting' })
        if (!compacting && phase === 'compacting') store.setState({ phase: 'running' })
      },
    })
    agent.state.tools = withWebSearch(
      agent.state.tools,
      webSearchAvailable(configState) && Boolean(conversation.webSearch),
    )
    setConversation(s, { ...conversation, selection: selectionFromState(state) })
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
      takeQueued(s).forEach(item => {
        agent.steer(createReaderUserMessage(item.text, item.attachments, item.references))
      })
    if (event.type === 'tool_execution_start') runtime.statuses.set(event.toolCallId, 'Running')
    if (event.type === 'tool_execution_end')
      runtime.statuses.set(
        event.toolCallId,
        signal.aborted ? 'Stopped' : event.isError ? 'Failed' : 'Completed',
      )
    refresh(s, agent)
    if (event.type === 'message_end') await persistAgentMessages(s, agent)
  })
  store.setState({ error: notice, phase: 'ready' })
}

// A conversation on a key of the reader's own that falls back elsewhere, most often to the free
// allowance through our server, says so before anything more is sent.
const lostOwnModel = (requested: ModelSelection | undefined, model: Model<Api>) =>
  requested &&
  isUserProvider(requested.provider) &&
  (requested.provider !== model.provider || requested.modelId !== model.id)
    ? `${requested.modelId} (your key) is no longer set up, so this conversation now uses ${model.name} (${isUserProvider(model.provider) ? 'your key' : 'free'}).`
    : undefined

// A tab that hides or dies keeps what already streamed: the messages still pending and the
// partial reply are written without advancing the count a surviving run re-persists from, so a
// run that goes on overwrites the partial with its finished message.
export const flushInFlight = async (s: SessionCtx) => {
  const { runtime } = s.session
  const agent = runtime.agent
  if (!agent) return
  await persistAgentMessages(s, agent)
  const partial = agent.state.isStreaming ? agent.state.streamingMessage : undefined
  if (partial?.role !== 'assistant') return
  await appendStoredConversationMessages({
    conversation: getConversation(s),
    startPosition: runtime.persistedMessageCount,
    // Marked stopped rather than finished: the reply was cut off, and the transcript
    // keeps only complete or ended messages.
    messages: [{ ...partial, stopReason: 'aborted' }],
  }).catch(cause => {
    reportStorageError(s.app, cause)
  })
}

// Holds a conversation in memory under the controller, with a draft queue of its own.
export const addSession = (app: Ctx, store: StoreApi<SessionState>): SessionCtx => {
  const s: SessionCtx = {
    app,
    session: {
      store,
      runtime: createSessionRuntime(),
      drafts: createDraftQueue(conversation => writeDraft(s, conversation)),
    },
  }
  app.runtime.sessions.set(store.getState().conversation.id, s.session)
  return s
}

export const openSession = (
  app: Ctx,
  conversation: StoredConversation,
  storedMessages: readonly AgentMessage[],
) => {
  const s = addSession(app, createSessionStore(conversation, 'connecting'))
  attachAgent(s, storedMessages)
  return s
}

// An idle conversation leaves memory; its saved state is what opens next time.
export const releaseSession = (s: SessionCtx) => {
  const { runtime } = s.session
  runtime.unsubscribe?.()
  runtime.unsubscribe = null
  runtime.agent = null
  const { id } = getConversation(s)
  if (s.app.runtime.sessions.get(id) === s.session) s.app.runtime.sessions.delete(id)
}
