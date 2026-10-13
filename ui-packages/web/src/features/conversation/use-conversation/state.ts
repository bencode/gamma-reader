import type { Agent, AgentMessage } from '@earendil-works/pi-agent-core'
import { createStore, type StoreApi } from 'zustand/vanilla'
import type { ConversationCursor, StoredConversation } from '../../../core/conversations'
import type { LocalTools } from '../../assistant/local-tools'
import type { TokenUsage } from '../token-usage'
import type { useDraftAttachments } from '../use-draft-attachments'
import type { createDraftQueue } from './draft-queue'
import type { ConversationMessage, ToolStatus } from './messages'
import type { ConfigState, ConversationPhase, ConversationView } from './session'

// What the panel renders.
export type ConversationState = {
  active: StoredConversation
  draft: string
  messages: ConversationMessage[]
  phase: ConversationPhase
  error?: string
  storageError?: string
  view: ConversationView
  usage: TokenUsage | null
  config: ConfigState
  history: {
    items: StoredConversation[]
    cursor: ConversationCursor | null
    loading: boolean
    error: string | null
  }
}

// What the controller keeps between calls and never renders.
export type Runtime = {
  agent: Agent | null
  unsubscribe: (() => void) | null
  compaction: AbortController | null
  busy: boolean
  switching: boolean
  initialized: boolean
  rawMessages: AgentMessage[]
  persistedMessageCount: number
  statuses: Map<string, ToolStatus>
  persistedIds: Set<string>
  memoryAttached: boolean
}

// The draft attachments live in React; these methods read their latest value and never change.
export type DraftAttachmentsPort = Pick<
  ReturnType<typeof useDraftAttachments>,
  'ready' | 'settle' | 'replaceReady' | 'restore' | 'takeReady'
>

export type Ctx = {
  store: StoreApi<ConversationState>
  runtime: Runtime
  tools: LocalTools
  attachments: DraftAttachmentsPort
  drafts: ReturnType<typeof createDraftQueue>
}

export const createState = (active: StoredConversation) =>
  createStore<ConversationState>(() => ({
    active,
    draft: '',
    messages: [],
    phase: 'loading',
    view: 'chat',
    usage: null,
    config: { kind: 'loading' },
    history: { items: [], cursor: null, loading: true, error: null },
  }))

export const createRuntime = (memoryAttached: boolean): Runtime => ({
  agent: null,
  unsubscribe: null,
  compaction: null,
  busy: false,
  switching: false,
  initialized: false,
  rawMessages: [],
  persistedMessageCount: 0,
  statuses: new Map(),
  persistedIds: new Set(),
  memoryAttached,
})

export const getActive = (ctx: Ctx) => ctx.store.getState().active

export const setActive = (ctx: Ctx, active: StoredConversation) => ctx.store.setState({ active })

export const reportStorageError = (ctx: Ctx, cause: unknown) => {
  console.error('Unable to save conversation', cause)
  ctx.store.setState({
    storageError: 'Conversation changes could not be saved in this browser. We will retry.',
  })
}
