import type {
  ConversationId,
  ConversationPage,
  StoredConversation,
} from '../../../core/conversations'
import { listStoredConversations } from '../../../data/conversation-store'
import type { ConversationState, Ctx } from './state'

// The list of past conversations, a page at a time, and which conversations are in storage: a
// conversation not yet saved is written only once it has something to keep.

const patch = (ctx: Ctx, change: Partial<ConversationState['history']>) =>
  ctx.store.setState(state => ({ history: { ...state.history, ...change } }))

const setItems = (ctx: Ctx, transform: (items: StoredConversation[]) => StoredConversation[]) =>
  ctx.store.setState(state => ({
    history: { ...state.history, items: transform(state.history.items) },
  }))

export const isPersisted = (ctx: Ctx, id: ConversationId) => ctx.runtime.persistedIds.has(id)

export const markPersisted = (ctx: Ctx, id: ConversationId) => {
  ctx.runtime.persistedIds.add(id)
}

export const placeFirst = (ctx: Ctx, conversation: StoredConversation) => {
  ctx.runtime.persistedIds.add(conversation.id)
  setItems(ctx, current => [conversation, ...current.filter(item => item.id !== conversation.id)])
}

export const update = (ctx: Ctx, conversation: StoredConversation) =>
  setItems(ctx, items => items.map(item => (item.id === conversation.id ? conversation : item)))

export const remove = (ctx: Ctx, id: ConversationId) => {
  ctx.runtime.persistedIds.delete(id)
  setItems(ctx, current => current.filter(item => item.id !== id))
}

export const replace = (ctx: Ctx, page: ConversationPage) => {
  ctx.runtime.persistedIds = new Set(page.items.map(item => item.id))
  patch(ctx, { items: page.items, cursor: page.nextCursor })
}

export const settle = (ctx: Ctx) => patch(ctx, { loading: false })

export const reload = async (ctx: Ctx) => {
  patch(ctx, { loading: true, error: null })
  try {
    replace(ctx, await listStoredConversations())
  } catch (cause) {
    console.error('Unable to load conversation history', cause)
    patch(ctx, { error: 'Conversation history could not be loaded.' })
  } finally {
    patch(ctx, { loading: false })
  }
}

export const loadMore = async (ctx: Ctx) => {
  const { loading, cursor, items } = ctx.store.getState().history
  if (loading || (!cursor && items.length)) return
  patch(ctx, { loading: true, error: null })
  try {
    const page = await listStoredConversations({ before: cursor })
    page.items.forEach(item => {
      ctx.runtime.persistedIds.add(item.id)
    })
    setItems(ctx, current => [
      ...current,
      ...page.items.filter(item => !current.some(existing => existing.id === item.id)),
    ])
    patch(ctx, { cursor: page.nextCursor })
  } catch (cause) {
    console.error('Unable to load more conversations', cause)
    patch(ctx, { error: 'More conversations could not be loaded.' })
  } finally {
    patch(ctx, { loading: false })
  }
}
