import { useCallback, useRef, useState } from 'react'
import type {
  ConversationId,
  ConversationPage,
  StoredConversation,
} from '../../../core/conversations'
import { listStoredConversations } from '../../../data/conversation-store'

// The list of past conversations, a page at a time, and which conversations are in storage: a
// conversation not yet saved is written only once it has something to keep.
export const useConversationHistory = () => {
  const [historyItems, setHistoryItems] = useState<StoredConversation[]>([])
  const [historyCursor, setHistoryCursor] = useState<readonly [number, string] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const persistedIds = useRef(new Set<string>())

  const isPersisted = useCallback((id: ConversationId) => persistedIds.current.has(id), [])

  const markPersisted = useCallback((id: ConversationId) => {
    persistedIds.current.add(id)
  }, [])

  const placeFirst = useCallback((conversation: StoredConversation) => {
    persistedIds.current.add(conversation.id)
    setHistoryItems(current => [
      conversation,
      ...current.filter(item => item.id !== conversation.id),
    ])
  }, [])

  const update = useCallback((conversation: StoredConversation) => {
    setHistoryItems(items => items.map(item => (item.id === conversation.id ? conversation : item)))
  }, [])

  const remove = useCallback((id: ConversationId) => {
    persistedIds.current.delete(id)
    setHistoryItems(current => current.filter(item => item.id !== id))
  }, [])

  const replace = useCallback((page: ConversationPage) => {
    persistedIds.current = new Set(page.items.map(item => item.id))
    setHistoryItems(page.items)
    setHistoryCursor(page.nextCursor)
  }, [])

  const settle = useCallback(() => setHistoryLoading(false), [])

  const reload = useCallback(async () => {
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const page = await listStoredConversations()
      persistedIds.current = new Set(page.items.map(item => item.id))
      setHistoryItems(page.items)
      setHistoryCursor(page.nextCursor)
    } catch (cause) {
      console.error('Unable to load conversation history', cause)
      setHistoryError('Conversation history could not be loaded.')
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (historyLoading || (!historyCursor && historyItems.length)) return
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const page = await listStoredConversations({ before: historyCursor })
      page.items.forEach(item => {
        persistedIds.current.add(item.id)
      })
      setHistoryItems(current => [
        ...current,
        ...page.items.filter(item => !current.some(existing => existing.id === item.id)),
      ])
      setHistoryCursor(page.nextCursor)
    } catch (cause) {
      console.error('Unable to load more conversations', cause)
      setHistoryError('More conversations could not be loaded.')
    } finally {
      setHistoryLoading(false)
    }
  }, [historyCursor, historyItems.length, historyLoading])

  return {
    items: historyItems,
    loading: historyLoading,
    error: historyError,
    hasMore: historyCursor !== null,
    isPersisted,
    markPersisted,
    placeFirst,
    update,
    remove,
    replace,
    settle,
    reload,
    loadMore,
  }
}
