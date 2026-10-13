import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { ConversationId } from '../../../core/conversations'
import { loadModelConfig } from '../../../core/models/model-config'
import { createModelRuntime } from '../../../core/models/model-runtime'
import {
  getStoredConversation,
  listStoredConversations,
  removeStoredConversation,
  touchStoredConversation,
} from '../../../data/conversation-store'
import { tokenUsage } from '../token-usage'
import { attachAgent, disposeAgent, showSession } from './agent-session'
import { currentDraft } from './drafts'
import { isPersisted, markPersisted, placeFirst, remove, replace, settle } from './history'
import { displayMessages, statusMap } from './messages'
import {
  activeConversationKey,
  type ConfigState,
  createConversation,
  nextActivityTime,
} from './session'
import { type Ctx, getActive, setActive } from './state'

const loadConfig = (signal: AbortSignal) =>
  loadModelConfig(signal)
    .then<ConfigState>(async config =>
      config.enabled
        ? { kind: 'enabled', runtime: await createModelRuntime(config), config }
        : { kind: 'unavailable' },
    )
    .catch(
      (cause): ConfigState => ({
        kind: 'error',
        message: cause instanceof Error ? cause.message : 'Could not connect to chat.',
      }),
    )

// Opens the conversation the reader had open, or the latest one, while the model configuration
// loads; the agent is attached once both are known. Returns the cleanup.
export const start = (ctx: Ctx) => {
  const { runtime, store } = ctx
  const controller = new AbortController()
  const configPromise = loadConfig(controller.signal)
  void (async () => {
    let conversation = getActive(ctx)
    let storedMessages: AgentMessage[] = []
    try {
      const page = await listStoredConversations()
      if (controller.signal.aborted) return
      replace(ctx, page)
      const requestedId = localStorage.getItem(activeConversationKey())
      const requested = requestedId ? await getStoredConversation(requestedId) : null
      const fallback =
        requested ?? (page.items[0] ? await getStoredConversation(page.items[0].id) : null)
      if (fallback) {
        conversation = fallback.conversation
        storedMessages = fallback.messages
        markPersisted(ctx, conversation.id)
        localStorage.setItem(activeConversationKey(), conversation.id)
      } else if (requestedId) localStorage.removeItem(activeConversationKey())
    } catch (cause) {
      if (controller.signal.aborted) return
      console.error('Unable to restore conversations', cause)
      store.setState({
        storageError: 'Saved conversations could not be opened. This chat will stay in memory.',
      })
    } finally {
      settle(ctx)
    }
    if (controller.signal.aborted) return
    setActive(ctx, conversation)
    store.setState({ draft: conversation.draft.text })
    ctx.attachments.replaceReady(conversation.draft.attachments)
    runtime.rawMessages = storedMessages
    runtime.persistedMessageCount = storedMessages.length
    runtime.statuses = statusMap(storedMessages)
    store.setState({
      messages: displayMessages(storedMessages, runtime.statuses),
      usage: tokenUsage(storedMessages),
    })
    runtime.initialized = true
    store.setState({ phase: 'connecting' })
    store.setState({ config: await configPromise })
    if (controller.signal.aborted) return
    attachAgent(ctx, getActive(ctx), runtime.rawMessages)
  })()
  return () => {
    controller.abort()
    runtime.compaction?.abort()
    runtime.unsubscribe?.()
    runtime.agent?.abort()
    runtime.unsubscribe = null
    runtime.agent = null
    runtime.busy = false
  }
}

export const switchTo = async (ctx: Ctx, id: ConversationId) => {
  const { runtime, store } = ctx
  if (runtime.switching || id === getActive(ctx).id) {
    store.setState({ view: 'chat' })
    return
  }
  runtime.switching = true
  store.setState({ phase: 'switching' })
  try {
    await disposeAgent(ctx, true)
    const stored = await getStoredConversation(id)
    if (!stored) throw new Error('Conversation is unavailable.')
    const conversation = await touchStoredConversation(id, nextActivityTime(stored.conversation))
    showSession(ctx, conversation, stored.messages)
    placeFirst(ctx, conversation)
    localStorage.setItem(activeConversationKey(), id)
    store.setState({ view: 'chat' })
  } catch (cause) {
    console.error('Unable to switch conversation', cause)
    store.setState({
      error: cause instanceof Error ? cause.message : 'Conversation could not be opened.',
    })
    attachAgent(ctx, getActive(ctx), runtime.rawMessages)
  } finally {
    runtime.switching = false
  }
}

export const startNew = async (ctx: Ctx) => {
  const { runtime, store } = ctx
  if (runtime.switching) return
  const draftNow = currentDraft(ctx)
  if (
    !isPersisted(ctx, getActive(ctx).id) &&
    !draftNow.text.trim() &&
    !draftNow.attachments.length &&
    runtime.rawMessages.length === 0
  ) {
    store.setState({ view: 'chat' })
    return
  }
  runtime.switching = true
  store.setState({ phase: 'switching' })
  try {
    await disposeAgent(ctx, true)
    const conversation = createConversation()
    localStorage.removeItem(activeConversationKey())
    showSession(ctx, conversation, [])
    store.setState({ view: 'chat' })
  } finally {
    runtime.switching = false
  }
}

export const deleteConversation = async (ctx: Ctx, id: ConversationId) => {
  const { runtime, store } = ctx
  if (runtime.switching) throw new Error('Wait for the current conversation to open.')
  const deletingActive = id === getActive(ctx).id
  runtime.switching = true
  if (deletingActive) store.setState({ phase: 'switching' })
  try {
    if (deletingActive) await disposeAgent(ctx, false)
    await removeStoredConversation(id)
    remove(ctx, id)
    if (!deletingActive) return
    localStorage.removeItem(activeConversationKey())
    const page = await listStoredConversations()
    replace(ctx, page)
    const nextStored = page.items[0] ? await getStoredConversation(page.items[0].id) : null
    if (nextStored) {
      showSession(ctx, nextStored.conversation, nextStored.messages)
      localStorage.setItem(activeConversationKey(), nextStored.conversation.id)
    } else showSession(ctx, createConversation(), [])
    store.setState({ view: 'chat' })
  } catch (cause) {
    if (deletingActive) attachAgent(ctx, getActive(ctx), runtime.rawMessages)
    throw cause
  } finally {
    runtime.switching = false
  }
}
