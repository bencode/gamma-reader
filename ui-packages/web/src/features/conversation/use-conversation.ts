import type { Agent, AgentMessage, AgentState } from '@earendil-works/pi-agent-core'
import type { ModelThinkingLevel } from '@earendil-works/pi-ai'
import type { ModelReference, PublicModelConfig } from '@gamma-reader/shared/model-config'
import { nanoid } from 'nanoid'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type ConversationDraft,
  type ConversationId,
  conversationTitle,
  emptyConversationDraft,
  foldQueued,
  type ModelSelection,
  type StoredConversation,
  type TitleSource,
} from '../../core/conversations'
import { loadModelConfig } from '../../core/models/model-config'
import { createModelRuntime, type ModelRuntime } from '../../core/models/model-runtime'
import { resolveModelSelection } from '../../core/models/model-selection'
import { readableProxyError } from '../../core/models/proxy-error'
import {
  type ConversationAttachment,
  createReaderUserMessage,
  isReaderUserMessage,
} from '../../core/reader-message'
import {
  appendStoredConversationMessages,
  getStoredConversation,
  listStoredConversations,
  removeStoredConversation,
  renameStoredConversation,
  saveStoredConversationDraft,
  touchStoredConversation,
} from '../../data/conversation-store'
import { workspaceStorageBases, workspaceStorageKey } from '../../data/workspace-database'
import { generateConversationTitle } from '../assistant/conversation-title'
import { conversationMessages, createReaderAgent } from '../assistant/create-reader-agent'
import type { LocalTools } from '../assistant/local-tools'
import { withWebSearch } from '../assistant/web-tools'
import { useMemoryEnabled } from '../memory'
import type { FileLibrary } from '../resources/use-file-library'
import { type TokenUsage, tokenUsage } from './token-usage'
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

type ConfigState =
  | { kind: 'loading' }
  | {
      kind: 'enabled'
      runtime: ModelRuntime
      config: Extract<PublicModelConfig, { enabled: true }>
    }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string }

const webSearchAvailable = (state: ConfigState) =>
  state.kind === 'enabled' && state.config.webSearch === true

const activeConversationKey = () => workspaceStorageKey(workspaceStorageBases.activeConversation)

const createConversation = (): StoredConversation => {
  const now = Date.now()
  return {
    id: nanoid(),
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
        ? readableProxyError(message.errorMessage) ||
          'Could not generate a reply. Send a message to try again.'
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

// A turn that ended this way stops the run, so the library would never read a steered message.
const runContinues = (message: AgentMessage) =>
  message.role === 'assistant' && message.stopReason !== 'error' && message.stopReason !== 'aborted'

const failedRun = (agent: Agent) => {
  const last = agent.state.messages.at(-1)
  return last?.role === 'assistant' && last.stopReason === 'error'
}

const displayMessages = (
  messages: readonly AgentMessage[],
  statuses: ReadonlyMap<string, ToolStatus>,
) => messages.flatMap((message, index) => snapshot(message, index, statuses))

const nextActivityTime = (conversation: StoredConversation) =>
  Math.max(Date.now(), conversation.lastActiveAt + 1)

const selectionFromState = ({
  model,
  thinkingLevel,
}: Pick<AgentState, 'model' | 'thinkingLevel'>): ModelSelection => ({
  provider: model.provider,
  modelId: model.id,
  effort: thinkingLevel,
})

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
  const [usage, setUsage] = useState<TokenUsage | null>(null)
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
  const restoreDraftAttachments = draftAttachments.restore

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
        localStorage.setItem(activeConversationKey(), conversation.id)
        setStorageError(undefined)
      } catch (cause) {
        reportStorageError(cause)
      }
    }
  }, [placeFirst, reportStorageError])

  const queueDraft = useCallback(
    (conversation: StoredConversation, saveEmpty = false) => {
      const hasDraft = Boolean(
        conversation.draft.text.trim() || conversation.draft.attachments.length,
      )
      if (!persistedIds.current.has(conversation.id) && !hasDraft && !saveEmpty)
        return Promise.resolve()
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

  const setQueued = useCallback((queued: ConversationDraft[]) => {
    const next = { ...activeRef.current, queued }
    activeRef.current = next
    setActive(next)
  }, [])

  // Not saved here: the next message_end writes the emptied queue and the message in one transaction.
  const takeQueued = useCallback(() => {
    const queued = activeRef.current.queued ?? []
    if (queued.length) setQueued([])
    return queued
  }, [setQueued])

  const restoreToDraft = useCallback(
    (items: readonly ConversationDraft[]) => {
      if (!items.length) return
      const next = foldQueued(currentDraft(), items)
      draftRef.current = next.text
      setDraftState(next.text)
      restoreDraftAttachments(items.flatMap(item => item.attachments))
      updateActiveDraft(next)
    },
    [currentDraft, restoreDraftAttachments, updateActiveDraft],
  )

  // The active conversation is written whole from memory, so its title changes there; any other
  // is changed in storage. A title the reader chose is never replaced by one the model suggests.
  const applyTitle = useCallback(
    async (id: ConversationId, title: string, titledBy: TitleSource) => {
      const current = activeRef.current
      if (current.id !== id) {
        const renamed = await renameStoredConversation(id, title, titledBy)
        setHistoryItems(items => items.map(item => (item.id === id ? renamed : item)))
        return
      }
      if (titledBy === 'model' && current.titledBy === 'reader') return
      const next = { ...current, title, titledBy }
      activeRef.current = next
      setActive(next)
      await queueDraft(next, true)
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
    rawMessages.current = conversationMessages(agent)
    const all = agent.state.streamingMessage
      ? [...rawMessages.current, agent.state.streamingMessage]
      : rawMessages.current
    setMessages(displayMessages(all, statuses.current))
    setUsage(tokenUsage(rawMessages.current))
  }, [])

  const persistAgentMessages = useCallback(
    async (agent: Agent) => {
      const pending = conversationMessages(agent).slice(persistedMessageCount.current)
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
        localStorage.setItem(activeConversationKey(), next.id)
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
      // Taken before stopping, so the run does not send it to an agent about to be dropped.
      const queued = takeQueued()
      if (agent?.state.isStreaming) agent.abort()
      if (agent) await agent.waitForIdle()
      await settleDraftAttachments()
      if (saveDraft) {
        updateActiveDraft(foldQueued(currentDraft(), queued))
        await queueDraft(activeRef.current)
      }
      await draftQueue.current.running
      unsubscribeRef.current?.()
      unsubscribeRef.current = null
      agentRef.current = null
      busy.current = false
    },
    [currentDraft, queueDraft, settleDraftAttachments, takeQueued, updateActiveDraft],
  )

  const attachAgent = useCallback(
    (conversation: StoredConversation, storedMessages: readonly AgentMessage[]) => {
      const configState = configRef.current
      rawMessages.current = [...storedMessages]
      persistedMessageCount.current = storedMessages.length
      statuses.current = statusMap(storedMessages)
      setMessages(displayMessages(storedMessages, statuses.current))
      setUsage(tokenUsage(storedMessages))
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
      let agent: Agent
      try {
        const state = resolveModelSelection(configState.runtime, conversation.selection)
        agent = createReaderAgent(configState.runtime, tools, {
          id: conversation.id,
          messages: storedMessages,
          ...state,
          web: () =>
            !webSearchAvailable(configRef.current)
              ? 'unavailable'
              : activeRef.current.webSearch
                ? 'on'
                : 'off',
        })
        agent.state.tools = withWebSearch(
          agent.state.tools,
          webSearchAvailable(configState) && Boolean(conversation.webSearch),
        )
        const next = { ...conversation, selection: selectionFromState(state) }
        activeRef.current = next
        setActive(next)
      } catch (cause) {
        console.error('Unable to initialize chat', cause)
        setError(cause instanceof Error ? cause.message : 'Could not initialize chat.')
        setPhase('error')
        return
      }
      agentRef.current = agent
      unsubscribeRef.current = agent.subscribe(async (event, signal) => {
        if (event.type === 'turn_end' && !signal.aborted && runContinues(event.message))
          takeQueued().forEach(item => {
            agent.steer(createReaderUserMessage(item.text, item.attachments))
          })
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
    [persistAgentMessages, refresh, takeQueued, tools],
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
    const configPromise = loadModelConfig(controller.signal)
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
    void (async () => {
      let conversation = initial
      let storedMessages: AgentMessage[] = []
      try {
        const page = await listStoredConversations()
        if (controller.signal.aborted) return
        persistedIds.current = new Set(page.items.map(item => item.id))
        setHistoryItems(page.items)
        setHistoryCursor(page.nextCursor)
        const requestedId = localStorage.getItem(activeConversationKey())
        const requested = requestedId ? await getStoredConversation(requestedId) : null
        const fallback =
          requested ?? (page.items[0] ? await getStoredConversation(page.items[0].id) : null)
        if (fallback) {
          conversation = fallback.conversation
          storedMessages = fallback.messages
          persistedIds.current.add(conversation.id)
          localStorage.setItem(activeConversationKey(), conversation.id)
        } else if (requestedId) localStorage.removeItem(activeConversationKey())
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
      setUsage(tokenUsage(storedMessages))
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
        localStorage.setItem(activeConversationKey(), id)
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
      localStorage.removeItem(activeConversationKey())
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
        localStorage.removeItem(activeConversationKey())
        const page = await listStoredConversations()
        persistedIds.current = new Set(page.items.map(item => item.id))
        setHistoryItems(page.items)
        setHistoryCursor(page.nextCursor)
        const nextStored = page.items[0] ? await getStoredConversation(page.items[0].id) : null
        if (nextStored) {
          showSession(nextStored.conversation, nextStored.messages)
          localStorage.setItem(activeConversationKey(), nextStored.conversation.id)
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

  // A title cut from the first message is often "summarize this"; once a reply has finished, the
  // model names the conversation from the exchange. A failure keeps the cut title and is tried
  // again after the next reply.
  const nameConversation = (
    agent: Agent,
    id: ConversationId,
    question: { text: string; attachments: readonly { name: string }[] },
  ) => {
    if (activeRef.current.id !== id || activeRef.current.titledBy) return
    const reply = agent.state.messages.at(-1)
    if (reply?.role !== 'assistant' || reply.stopReason !== 'stop') return
    const answer = reply.content.flatMap(block => (block.type === 'text' ? [block.text] : []))
    generateConversationTitle(agent.state.model, {
      question: question.text || question.attachments.map(item => item.name).join(', '),
      answer: answer.join(''),
    })
      .then(title => applyTitle(id, title, 'model'))
      .catch(cause => console.error('Unable to name the conversation', cause))
  }

  // Queued messages join the run at its next turn; whatever is left when it stops, including after
  // an abort, is sent as the next prompt. A failed run hands them back as the draft.
  const run = async (agent: Agent, batch: readonly ConversationDraft[]) => {
    busy.current = true
    setError(undefined)
    try {
      for (let items = batch; items.length; items = takeQueued()) {
        setPhase('running')
        const sending = items.map(item => ({
          item,
          message: createReaderUserMessage(item.text, item.attachments),
        }))
        try {
          await agent.prompt(sending.map(entry => entry.message))
        } catch (cause) {
          if (agentRef.current !== agent) return
          setError(cause instanceof Error ? cause.message : 'Could not send the message.')
          const recorded = new Set(
            agent.state.messages.flatMap(item =>
              isReaderUserMessage(item) ? [item.reader.id] : [],
            ),
          )
          const unsent = sending.filter(entry => !recorded.has(entry.message.reader.id))
          restoreToDraft([...unsent.map(entry => entry.item), ...takeQueued()])
          return
        }
        if (agentRef.current !== agent) return
        nameConversation(agent, activeRef.current.id, foldQueued(emptyConversationDraft(), items))
        if (failedRun(agent)) {
          restoreToDraft(takeQueued())
          return
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

  const send = () => {
    const agent = agentRef.current
    const text = draftRef.current.trim()
    if (!agent || draftAttachments.unsettled || (!text && !draftAttachments.attachments.length))
      return
    const item = { text, attachments: draftAttachments.takeReady().map(entry => entry.metadata) }
    const current = activeRef.current
    const queuing = busy.current
    const submitted = {
      ...current,
      title: current.title ?? conversationTitle(item),
      draft: emptyConversationDraft(),
      queued: queuing ? [...(current.queued ?? []), item] : current.queued,
      lastActiveAt: nextActivityTime(current),
    }
    activeRef.current = submitted
    setActive(submitted)
    void queueDraft(submitted, queuing)
    draftRef.current = ''
    setDraftState('')
    if (!queuing) void run(agent, [item])
  }

  const removeQueued = (index: number) => {
    setQueued((activeRef.current.queued ?? []).filter((_, position) => position !== index))
    void queueDraft(activeRef.current, true)
  }

  const configureModel = (selection: ModelSelection) => {
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
    const state = resolveModelSelection(config.runtime, selection)
    const next = {
      ...activeRef.current,
      selection: selectionFromState(state),
      lastActiveAt: nextActivityTime(activeRef.current),
    }
    agent.state.model = state.model
    agent.state.thinkingLevel = state.thinkingLevel
    activeRef.current = next
    setActive(next)
    void queueDraft(next, true)
  }

  // Takes effect from the next message; a reply already running keeps the tools it started with.
  const setWebSearch = (on: boolean) => {
    const next = { ...activeRef.current, webSearch: on }
    const agent = agentRef.current
    if (agent) agent.state.tools = withWebSearch(agent.state.tools, on)
    activeRef.current = next
    setActive(next)
    void queueDraft(next, true)
  }

  const refreshProviders = useCallback(async () => {
    const current = configRef.current
    if (current.kind !== 'enabled') return
    configRef.current = {
      kind: 'enabled',
      runtime: await createModelRuntime(current.config),
      config: current.config,
    }
    attachAgent(activeRef.current, rawMessages.current)
  }, [attachAgent])

  // Turning memory on or off reaches the open conversation at once, unless a reply is running: that
  // reply keeps the tools it started with, and the setting reaches the next conversation opened.
  const memoryOn = useMemoryEnabled()
  const memoryAttached = useRef(memoryOn)
  useEffect(() => {
    if (memoryAttached.current === memoryOn) return
    memoryAttached.current = memoryOn
    if (!agentRef.current || busy.current || switching.current) return
    attachAgent(activeRef.current, rawMessages.current)
  }, [attachAgent, memoryOn])

  const runtime = configRef.current.kind === 'enabled' ? configRef.current.runtime : null
  const selection = active.selection
  const contextWindow = runtime?.providers
    .flatMap(provider => provider.models)
    .find(
      model => model.provider === selection?.provider && model.id === selection.modelId,
    )?.contextWindow

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
    renameConversation: (id: ConversationId, title: string) => applyTitle(id, title, 'reader'),
    send,
    stop,
    queued: active.queued ?? [],
    removeQueued,
    draftAttachments,
    // A window of 0 is one the catalog does not know.
    tokenUsage: usage && { ...usage, contextWindow: contextWindow || undefined },
    modelConfiguration: runtime && selection ? { providers: runtime.providers, selection } : null,
    webSearch: webSearchAvailable(configRef.current)
      ? { enabled: Boolean(active.webSearch), set: setWebSearch }
      : null,
    selectModel: (model: ModelReference) => {
      if (selection) configureModel({ ...model, effort: selection.effort })
    },
    refreshProviders,
    selectEffort: (effort: ModelThinkingLevel) => {
      if (selection) configureModel({ ...selection, effort })
    },
  }
}
