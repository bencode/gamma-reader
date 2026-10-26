import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { ConversationId } from '../../../core/conversations'
import { loadModelConfig } from '../../../core/models/model-config'
import { createChatRuntime } from '../../../core/models/model-runtime'
import {
  getStoredConversation,
  listStoredConversations,
  removeStoredConversation,
  touchStoredConversation,
} from '../../../data/conversation-store'
import { attachAgent, disposeAgent, openSession, releaseSession } from './agent-session'
import { currentDraft, updateDraft } from './drafts'
import { isPersisted, markPersisted, placeFirst, remove, replace, settle } from './history'
import {
  activeConversationKey,
  type ConfigState,
  createConversation,
  lastChosenModel,
  nextActivityTime,
} from './session'
import { activeSession, type Ctx, getConversation, type SessionCtx, setActivity } from './state'

const loadConfig = (signal: AbortSignal) =>
  loadModelConfig(signal)
    .then<ConfigState>(async config => {
      const chat = await createChatRuntime(config)
      return chat ? { kind: 'enabled', ...chat } : { kind: 'unavailable' }
    })
    .catch(
      (cause): ConfigState => ({
        kind: 'error',
        message: cause instanceof Error ? cause.message : 'Could not connect to chat.',
      }),
    )

// Makes a conversation in memory the open one: the tray takes its draft attachments and its
// unread mark goes. It runs without awaiting, so a reply cannot finish and release it midway.
const activate = (ctx: Ctx, s: SessionCtx) => {
  const conversation = getConversation(s)
  ctx.store.setState({ activeId: conversation.id, session: s.session.store, view: 'chat' })
  if (ctx.store.getState().activity[conversation.id] === 'unread')
    setActivity(ctx, conversation.id, null)
  ctx.attachments.replaceReady(conversation.draft.attachments)
}

// Called on the open conversation before another opens, while the tray still holds its files.
const saveDraft = async (s: SessionCtx) => {
  await s.app.attachments.settle()
  updateDraft(s, currentDraft(s))
  await s.session.drafts.idle()
}

// A conversation that was open stays in memory only while it answers.
const letGo = (s: SessionCtx) => {
  if (!s.session.runtime.busy) releaseSession(s)
}

const readConversation = async (ctx: Ctx, id: ConversationId) => {
  const stored = await getStoredConversation(id)
  if (!stored) throw new Error('Conversation is unavailable.')
  const conversation = await touchStoredConversation(id, nextActivityTime(stored.conversation))
  placeFirst(ctx, conversation)
  return { conversation, messages: stored.messages }
}

// A conversation that left memory while the open one was saved is read again.
const openRead = async (
  ctx: Ctx,
  id: ConversationId,
  read: Awaited<ReturnType<typeof readConversation>> | null,
) => {
  const { conversation, messages } = read ?? (await readConversation(ctx, id))
  return openSession(ctx, conversation, messages)
}

// Opens the conversation the reader had open, or the latest one, while the model configuration
// loads; the agent is attached once both are known. Returns the cleanup.
export const start = (ctx: Ctx) => {
  const { runtime, store } = ctx
  const controller = new AbortController()
  const configPromise = loadConfig(controller.signal)
  void (async () => {
    const placeholder = activeSession(ctx)
    let conversation = getConversation(placeholder)
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
    releaseSession(placeholder)
    activate(ctx, openSession(ctx, conversation, storedMessages))
    runtime.initialized = true
    store.setState({ config: await configPromise })
    if (controller.signal.aborted) return
    const s = activeSession(ctx)
    attachAgent(s, s.session.runtime.rawMessages)
  })()
  return () => {
    controller.abort()
    runtime.sessions.forEach(session => {
      session.runtime.compaction?.abort()
      session.runtime.unsubscribe?.()
      session.runtime.agent?.abort()
      session.runtime.unsubscribe = null
      session.runtime.agent = null
      session.runtime.busy = false
    })
  }
}

// The conversation left keeps answering in the background; one not in memory is read first, so a
// conversation that cannot be opened leaves the current one as it was.
export const switchTo = async (ctx: Ctx, id: ConversationId) => {
  const { runtime, store } = ctx
  if (store.getState().switching || id === store.getState().activeId) {
    store.setState({ view: 'chat' })
    return
  }
  store.setState({ switching: true })
  const previous = activeSession(ctx)
  try {
    const stored = runtime.sessions.has(id) ? null : await readConversation(ctx, id)
    await saveDraft(previous)
    // Taken without awaiting, as activate is, so a reply finishing now cannot release it first.
    const kept = runtime.sessions.get(id)
    const next = kept ? { app: ctx, session: kept } : await openRead(ctx, id, stored)
    activate(ctx, next)
    letGo(previous)
    localStorage.setItem(activeConversationKey(), id)
  } catch (cause) {
    console.error('Unable to switch conversation', cause)
    previous.session.store.setState({
      error: cause instanceof Error ? cause.message : 'Conversation could not be opened.',
    })
  } finally {
    store.setState({ switching: false })
  }
}

export const startNew = async (ctx: Ctx) => {
  const { store } = ctx
  if (store.getState().switching) return
  const previous = activeSession(ctx)
  const draftNow = currentDraft(previous)
  if (
    !isPersisted(ctx, getConversation(previous).id) &&
    !draftNow.text.trim() &&
    !draftNow.attachments.length &&
    previous.session.runtime.rawMessages.length === 0
  ) {
    store.setState({ view: 'chat' })
    return
  }
  store.setState({ switching: true })
  try {
    await saveDraft(previous)
    activate(ctx, openSession(ctx, createConversation(lastChosenModel()), []))
    letGo(previous)
    localStorage.removeItem(activeConversationKey())
  } finally {
    store.setState({ switching: false })
  }
}

export const deleteConversation = async (ctx: Ctx, id: ConversationId) => {
  const { runtime, store } = ctx
  if (store.getState().switching) throw new Error('Wait for the current conversation to open.')
  const deletingActive = id === store.getState().activeId
  const kept = runtime.sessions.get(id)
  const deleted = kept ? { app: ctx, session: kept } : null
  store.setState({ switching: true })
  try {
    if (deleted) await disposeAgent(deleted)
    await removeStoredConversation(id)
    remove(ctx, id)
    setActivity(ctx, id, null)
    if (!deletingActive) {
      if (deleted) releaseSession(deleted)
      return
    }
    localStorage.removeItem(activeConversationKey())
    const page = await listStoredConversations()
    replace(ctx, page)
    const nextId = page.items[0]?.id
    const keptNext = nextId ? runtime.sessions.get(nextId) : undefined
    const nextStored = nextId && !keptNext ? await getStoredConversation(nextId) : null
    const next = keptNext
      ? { app: ctx, session: keptNext }
      : nextStored
        ? openSession(ctx, nextStored.conversation, nextStored.messages)
        : // Starts on the model the reader last chose, not on the free allowance.
          openSession(ctx, createConversation(lastChosenModel()), [])
    activate(ctx, next)
    if (deleted) releaseSession(deleted)
    if (nextId) localStorage.setItem(activeConversationKey(), nextId)
  } catch (cause) {
    if (deletingActive && deleted) attachAgent(deleted, deleted.session.runtime.rawMessages)
    throw cause
  } finally {
    store.setState({ switching: false })
  }
}
