import type { Agent, AgentMessage } from '@earendil-works/pi-agent-core'
import type { AgentConfig, AgentSelection } from '@gamma-reader/server/agent-contract'
import { useCallback, useEffect, useRef, useState } from 'react'
import { resolveAgentSelection } from '../../core/agent/model-settings'
import {
  type ConversationAttachment,
  createReaderUserMessage,
  isReaderUserMessage,
} from '../../core/agent/reader-message'
import { agentModelState, loadAgentConfig } from '../../core/agent/runtime'
import {
  type ConversationDraft,
  type ConversationId,
  conversationTitle,
  emptyConversationDraft,
  type StoredConversation,
} from '../../core/conversations'
import {
  appendStoredConversationMessages,
  getStoredConversation,
  listStoredConversations,
  removeStoredConversation,
  saveStoredConversationDraft,
  touchStoredConversation,
} from '../../data/conversation-store'
import { createReaderAgent } from '../agent/create-reader-agent'
import type { LocalTools } from '../agent/local-tools'
import type { FileLibrary } from '../resources/use-file-library'
import { useDraftAttachments } from './use-draft-attachments'

type ToolStatus = 'Pending' | 'Running' | 'Completed' | 'Failed' | 'Stopped'
export type ConversationMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  attachments: ConversationAttachment[]
  tools: { id: string; name: string; status: ToolStatus }[]
  notice?: string
  failed?: boolean
  copyable?: boolean
}
export type ConversationPhase =
  | 'loading'
  | 'connecting'
  | 'ready'
  | 'unavailable'
  | 'error'
  | 'running'
  | 'stopping'
  | 'switching'
export type ConversationView = 'chat' | 'history'

type EnabledConfig = Extract<AgentConfig, { enabled: true }>
type ConfigState =
  | { kind: 'loading' }
  | { kind: 'enabled'; config: EnabledConfig }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string }

const activeConversationKey = 'gamma-reader.active-conversation'

const createConversation = (): StoredConversation => {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    title: null,
    draft: emptyConversationDraft(),
    createdAt: now,
    lastActiveAt: now,
  }
}

const statusMap = (messages: readonly AgentMessage[]) => {
  const statuses = new Map<string, ToolStatus>()
  messages.forEach(message => {
    if (message.role === 'assistant')
      message.content.forEach(block => {
        if (block.type === 'toolCall') statuses.set(block.id, 'Stopped')
      })
    if (message.role === 'toolResult')
      statuses.set(message.toolCallId, message.isError ? 'Failed' : 'Completed')
  })
  return statuses
}

const snapshot = (
  message: AgentMessage,
  index: number,
  statuses: ReadonlyMap<string, ToolStatus>,
): ConversationMessage[] => {
  if (message.role !== 'user' && message.role !== 'assistant') return []
  const blocks =
    typeof message.content === 'string'
      ? [{ type: 'text' as const, text: message.content }]
      : message.content
  const text = blocks.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('')
  const tools = blocks.flatMap(block =>
    block.type === 'toolCall'
      ? [{ id: block.id, name: block.name, status: statuses.get(block.id) ?? 'Pending' }]
      : [],
  )
  if (message.role === 'user') {
    const reader = isReaderUserMessage(message) ? message.reader : null
    return [
      {
        id: reader?.id ?? `user:${index}`,
        role: 'user',
        text: reader?.text ?? text,
        attachments: reader?.attachments ?? [],
        tools,
      },
    ]
  }
  const notice =
    message.stopReason === 'aborted'
      ? 'Generation stopped.'
      : message.stopReason === 'error'
        ? message.errorMessage || 'Could not generate a reply. Send a message to try again.'
        : message.stopReason === 'length'
          ? 'The response reached its output limit.'
          : undefined
  return [
    {
      id: `assistant:${index}`,
      role: 'assistant',
      text,
      attachments: [],
      tools,
      notice,
      failed: message.stopReason === 'error',
      copyable: message.stopReason === 'stop' || message.stopReason === 'length',
    },
  ]
}

const displayMessages = (
  messages: readonly AgentMessage[],
  statuses: ReadonlyMap<string, ToolStatus>,
) => messages.flatMap((message, index) => snapshot(message, index, statuses))

const nextActivityTime = (conversation: StoredConversation) =>
  Math.max(Date.now(), conversation.lastActiveAt + 1)

export const useConversation = (
  tools: LocalTools,
  addWorkspaceAttachments: FileLibrary['addAttachments'],
) => {
  const initial = useRef(createConversation()).current
  const [active, setActive] = useState(initial)
  const [draft, setDraftState] = useState('')
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [phase, setPhase] = useState<ConversationPhase>('loading')
  const [error, setError] = useState<string>()
  const [storageError, setStorageError] = useState<string>()
  const [view, setView] = useState<ConversationView>('chat')
  const [historyItems, setHistoryItems] = useState<StoredConversation[]>([])
  const [historyCursor, setHistoryCursor] = useState<readonly [number, string] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const activeRef = useRef(active)
  const draftRef = useRef('')
  const rawMessages = useRef<AgentMessage[]>([])
  const persistedMessageCount = useRef(0)
  const persistedIds = useRef(new Set<string>())
  const agentRef = useRef<Agent | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const busy = useRef(false)
  const switching = useRef(false)
  const initialized = useRef(false)
  const statuses = useRef(new Map<string, ToolStatus>())
  const configRef = useRef<ConfigState>({ kind: 'loading' })
  const draftQueue = useRef<{ pending?: StoredConversation; running?: Promise<void> }>({})
  const draftAttachments = useDraftAttachments(addWorkspaceAttachments)
  const readyDraftAttachments = draftAttachments.ready
  const settleDraftAttachments = draftAttachments.settle
  const replaceDraftAttachments = draftAttachments.replaceReady

  const reportStorageError = useCallback((cause: unknown) => {
    console.error('Unable to save conversation', cause)
    setStorageError('Conversation changes could not be saved in this browser. We will retry.')
  }, [])

  const placeFirst = useCallback((conversation: StoredConversation) => {
    persistedIds.current.add(conversation.id)
    setHistoryItems(current => [
      conversation,
      ...current.filter(item => item.id !== conversation.id),
    ])
  }, [])

  const drainDrafts = useCallback(async () => {
    while (draftQueue.current.pending) {
      const conversation = draftQueue.current.pending
      draftQueue.current.pending = undefined
      try {
        await saveStoredConversationDraft(conversation)
        placeFirst(conversation)
        localStorage.setItem(activeConversationKey, conversation.id)
        setStorageError(undefined)
      } catch (cause) {
        reportStorageError(cause)
      }
    }
  }, [placeFirst, reportStorageError])

  const queueDraft = useCallback(
    (conversation: StoredConversation) => {
      const hasDraft = Boolean(
        conversation.draft.text.trim() ||
          conversation.draft.attachments.length ||
          conversation.selection,
      )
      if (!persistedIds.current.has(conversation.id) && !hasDraft) return Promise.resolve()
      draftQueue.current.pending = conversation
      draftQueue.current.running ??= drainDrafts().finally(() => {
        draftQueue.current.running = undefined
      })
      return draftQueue.current.running
    },
    [drainDrafts],
  )

  const currentDraft = useCallback(
    (text = draftRef.current): ConversationDraft => ({
      text,
      attachments: readyDraftAttachments(),
    }),
    [readyDraftAttachments],
  )

  const updateActiveDraft = useCallback(
    (nextDraft: ConversationDraft) => {
      const current = activeRef.current
      const next = { ...current, draft: nextDraft, lastActiveAt: nextActivityTime(current) }
      activeRef.current = next
      setActive(next)
      void queueDraft(next)
    },
    [queueDraft],
  )

  const setDraft = useCallback(
    (text: string) => {
      draftRef.current = text
      setDraftState(text)
      if (initialized.current) updateActiveDraft(currentDraft(text))
    },
    [currentDraft, updateActiveDraft],
  )

  useEffect(() => {
    if (!initialized.current || switching.current) return
    updateActiveDraft({
      text: draftRef.current,
      attachments: draftAttachments.attachments.flatMap(item =>
        item.status === 'ready' ? [item.metadata] : [],
      ),
    })
  }, [draftAttachments.attachments, updateActiveDraft])

  const refresh = useCallback((agent: Agent) => {
    rawMessages.current = [...agent.state.messages]
    const all = agent.state.streamingMessage
      ? [...agent.state.messages, agent.state.streamingMessage]
      : agent.state.messages
    setMessages(displayMessages(all, statuses.current))
  }, [])

  const persistAgentMessages = useCallback(
    async (agent: Agent) => {
      const pending = agent.state.messages.slice(persistedMessageCount.current)
      if (!pending.length) return
      const current = activeRef.current
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
      activeRef.current = next
      setActive(next)
      try {
        await appendStoredConversationMessages({
          conversation: next,
          startPosition: persistedMessageCount.current,
          messages: pending,
        })
        persistedMessageCount.current += pending.length
        placeFirst(next)
        localStorage.setItem(activeConversationKey, next.id)
        setStorageError(undefined)
      } catch (cause) {
        reportStorageError(cause)
      }
    },
    [placeFirst, reportStorageError],
  )

  const disposeAgent = useCallback(
    async (saveDraft: boolean) => {
      const agent = agentRef.current
      if (agent?.state.isStreaming) agent.abort()
      if (agent) await agent.waitForIdle()
      await settleDraftAttachments()
      if (saveDraft) {
        updateActiveDraft(currentDraft())
        await queueDraft(activeRef.current)
      }
      await draftQueue.current.running
      unsubscribeRef.current?.()
      unsubscribeRef.current = null
      agentRef.current = null
      busy.current = false
    },
    [currentDraft, queueDraft, settleDraftAttachments, updateActiveDraft],
  )

  const attachAgent = useCallback(
    (conversation: StoredConversation, storedMessages: readonly AgentMessage[]) => {
      const configState = configRef.current
      rawMessages.current = [...storedMessages]
      persistedMessageCount.current = storedMessages.length
      statuses.current = statusMap(storedMessages)
      setMessages(displayMessages(storedMessages, statuses.current))
      if (configState.kind === 'loading') {
        setPhase('connecting')
        return
      }
      if (configState.kind === 'unavailable') {
        setPhase('unavailable')
        return
      }
      if (configState.kind === 'error') {
        setError(configState.message)
        setPhase('error')
        return
      }
      const agent = createReaderAgent(configState.config, tools, {
        id: conversation.id,
        messages: storedMessages,
        selection: conversation.selection,
      })
      agentRef.current = agent
      unsubscribeRef.current = agent.subscribe(async (event, signal) => {
        if (event.type === 'tool_execution_start') statuses.current.set(event.toolCallId, 'Running')
        if (event.type === 'tool_execution_end')
          statuses.current.set(
            event.toolCallId,
            signal.aborted ? 'Stopped' : event.isError ? 'Failed' : 'Completed',
          )
        refresh(agent)
        if (event.type === 'message_end') await persistAgentMessages(agent)
      })
      setError(undefined)
      setPhase('ready')
    },
    [persistAgentMessages, refresh, tools],
  )

  const showSession = useCallback(
    (conversation: StoredConversation, storedMessages: readonly AgentMessage[]) => {
      activeRef.current = conversation
      setActive(conversation)
      draftRef.current = conversation.draft.text
      setDraftState(conversation.draft.text)
      replaceDraftAttachments(conversation.draft.attachments)
      attachAgent(conversation, storedMessages)
    },
    [attachAgent, replaceDraftAttachments],
  )

  const reloadHistory = useCallback(async () => {
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

  useEffect(() => {
    const controller = new AbortController()
    const configPromise = loadAgentConfig(controller.signal)
      .then<ConfigState>(config =>
        config.enabled ? { kind: 'enabled', config } : { kind: 'unavailable' },
      )
      .catch(
        (cause): ConfigState => ({
          kind: 'error',
          message: cause instanceof Error ? cause.message : 'Could not connect to chat.',
        }),
      )
    void (async () => {
      let conversation = initial
      let storedMessages: AgentMessage[] = []
      try {
        const page = await listStoredConversations()
        if (controller.signal.aborted) return
        persistedIds.current = new Set(page.items.map(item => item.id))
        setHistoryItems(page.items)
        setHistoryCursor(page.nextCursor)
        const requestedId = localStorage.getItem(activeConversationKey)
        const requested = requestedId ? await getStoredConversation(requestedId) : null
        const fallback =
          requested ?? (page.items[0] ? await getStoredConversation(page.items[0].id) : null)
        if (fallback) {
          conversation = fallback.conversation
          storedMessages = fallback.messages
          persistedIds.current.add(conversation.id)
          localStorage.setItem(activeConversationKey, conversation.id)
        } else if (requestedId) localStorage.removeItem(activeConversationKey)
      } catch (cause) {
        if (controller.signal.aborted) return
        console.error('Unable to restore conversations', cause)
        setStorageError('Saved conversations could not be opened. This chat will stay in memory.')
      } finally {
        setHistoryLoading(false)
      }
      if (controller.signal.aborted) return
      activeRef.current = conversation
      setActive(conversation)
      draftRef.current = conversation.draft.text
      setDraftState(conversation.draft.text)
      replaceDraftAttachments(conversation.draft.attachments)
      rawMessages.current = storedMessages
      persistedMessageCount.current = storedMessages.length
      statuses.current = statusMap(storedMessages)
      setMessages(displayMessages(storedMessages, statuses.current))
      initialized.current = true
      setPhase('connecting')
      configRef.current = await configPromise
      if (controller.signal.aborted) return
      attachAgent(activeRef.current, rawMessages.current)
    })()
    return () => {
      controller.abort()
      unsubscribeRef.current?.()
      agentRef.current?.abort()
      unsubscribeRef.current = null
      agentRef.current = null
      busy.current = false
    }
  }, [attachAgent, initial, replaceDraftAttachments])

  const switchTo = useCallback(
    async (id: ConversationId) => {
      if (switching.current || id === activeRef.current.id) {
        setView('chat')
        return
      }
      switching.current = true
      setPhase('switching')
      try {
        await disposeAgent(true)
        const stored = await getStoredConversation(id)
        if (!stored) throw new Error('Conversation is unavailable.')
        const conversation = await touchStoredConversation(
          id,
          nextActivityTime(stored.conversation),
        )
        showSession(conversation, stored.messages)
        placeFirst(conversation)
        localStorage.setItem(activeConversationKey, id)
        setView('chat')
      } catch (cause) {
        console.error('Unable to switch conversation', cause)
        setError(cause instanceof Error ? cause.message : 'Conversation could not be opened.')
        attachAgent(activeRef.current, rawMessages.current)
      } finally {
        switching.current = false
      }
    },
    [attachAgent, disposeAgent, placeFirst, showSession],
  )

  const startNew = useCallback(async () => {
    if (switching.current) return
    const draftNow = currentDraft()
    if (
      !persistedIds.current.has(activeRef.current.id) &&
      !draftNow.text.trim() &&
      !draftNow.attachments.length &&
      rawMessages.current.length === 0
    ) {
      setView('chat')
      return
    }
    switching.current = true
    setPhase('switching')
    try {
      await disposeAgent(true)
      const conversation = createConversation()
      localStorage.removeItem(activeConversationKey)
      showSession(conversation, [])
      setView('chat')
    } finally {
      switching.current = false
    }
  }, [currentDraft, disposeAgent, showSession])

  const deleteConversation = useCallback(
    async (id: ConversationId) => {
      if (switching.current) throw new Error('Wait for the current conversation to open.')
      const deletingActive = id === activeRef.current.id
      switching.current = true
      if (deletingActive) setPhase('switching')
      try {
        if (deletingActive) await disposeAgent(false)
        await removeStoredConversation(id)
        persistedIds.current.delete(id)
        if (!deletingActive) {
          setHistoryItems(current => current.filter(item => item.id !== id))
          return
        }
        localStorage.removeItem(activeConversationKey)
        const page = await listStoredConversations()
        persistedIds.current = new Set(page.items.map(item => item.id))
        setHistoryItems(page.items)
        setHistoryCursor(page.nextCursor)
        const nextStored = page.items[0] ? await getStoredConversation(page.items[0].id) : null
        if (nextStored) {
          showSession(nextStored.conversation, nextStored.messages)
          localStorage.setItem(activeConversationKey, nextStored.conversation.id)
        } else showSession(createConversation(), [])
        setView('chat')
      } catch (cause) {
        if (deletingActive) attachAgent(activeRef.current, rawMessages.current)
        throw cause
      } finally {
        switching.current = false
      }
    },
    [attachAgent, disposeAgent, showSession],
  )

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

  const send = async () => {
    const agent = agentRef.current
    const text = draftRef.current.trim()
    if (
      !agent ||
      busy.current ||
      draftAttachments.unsettled ||
      (!text && !draftAttachments.attachments.length)
    )
      return
    const outgoingAttachments = draftAttachments.takeReady()
    const message = createReaderUserMessage(
      text,
      outgoingAttachments.map(item => item.metadata),
    )
    const current = activeRef.current
    const submitted = {
      ...current,
      title: current.title ?? conversationTitle({ text, attachments: message.reader.attachments }),
      draft: emptyConversationDraft(),
      lastActiveAt: nextActivityTime(current),
    }
    activeRef.current = submitted
    setActive(submitted)
    void queueDraft(submitted)
    busy.current = true
    setPhase('running')
    setError(undefined)
    draftRef.current = ''
    setDraftState('')
    try {
      await agent.prompt(message)
    } catch (cause) {
      const recorded = agent.state.messages.some(
        item => isReaderUserMessage(item) && item.reader.id === message.reader.id,
      )
      if (agentRef.current === agent) {
        setError(cause instanceof Error ? cause.message : 'Could not send the message.')
        if (!recorded) {
          draftRef.current = text
          setDraftState(text)
          draftAttachments.restore(outgoingAttachments)
          updateActiveDraft({
            text,
            attachments: outgoingAttachments.map(item => item.metadata),
          })
        }
      }
    } finally {
      if (agentRef.current === agent) {
        busy.current = false
        statuses.current.forEach((status, id) => {
          if (status === 'Running') statuses.current.set(id, 'Stopped')
        })
        refresh(agent)
        setPhase('ready')
      }
    }
  }

  const configureModel = (selection: AgentSelection) => {
    const config = configRef.current
    const agent = agentRef.current
    if (
      !agent ||
      phase !== 'ready' ||
      busy.current ||
      switching.current ||
      config.kind !== 'enabled'
    )
      return
    const next = {
      ...activeRef.current,
      selection: resolveAgentSelection(config.config, selection),
      lastActiveAt: nextActivityTime(activeRef.current),
    }
    const state = agentModelState(config.config, next.selection)
    agent.state.model = state.model
    agent.state.thinkingLevel = state.thinkingLevel
    activeRef.current = next
    setActive(next)
    void queueDraft(next)
  }

  const enabledConfig = configRef.current.kind === 'enabled' ? configRef.current.config : null

  const stop = () => {
    if (!busy.current) return
    setPhase('stopping')
    agentRef.current?.abort()
  }

  return {
    active,
    draft,
    setDraft,
    messages,
    phase,
    error,
    storageError,
    dismissStorageError: () => setStorageError(undefined),
    view,
    showChat: () => setView('chat'),
    showHistory: () => setView('history'),
    historyItems,
    historyLoading,
    historyError,
    historyHasMore: historyCursor !== null,
    reloadHistory,
    loadMore,
    switchTo,
    startNew,
    deleteConversation,
    send,
    stop,
    draftAttachments,
    modelConfiguration: enabledConfig
      ? {
          models: enabledConfig.models,
          selection: resolveAgentSelection(enabledConfig, active.selection),
        }
      : null,
    configureModel,
  }
}
