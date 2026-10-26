import type { Agent, AgentMessage } from '@earendil-works/pi-agent-core'
import { createStore, type StoreApi } from 'zustand/vanilla'
import type {
  ConversationCursor,
  ConversationId,
  StoredConversation,
} from '../../../core/conversations'
import type { LocalTools } from '../../assistant/local-tools'
import type { TokenUsage } from '../token-usage'
import type { useDraftAttachments } from '../use-draft-attachments'
import type { createDraftQueue } from './draft-queue'
import type { ConversationMessage, ToolStatus } from './messages'
import type { ConfigState, ConversationPhase, ConversationView } from './session'

export type SessionPhase = Exclude<ConversationPhase, 'switching'>

// What the panel renders of one conversation.
export type SessionState = {
  conversation: StoredConversation
  draft: string
  messages: ConversationMessage[]
  phase: SessionPhase
  error?: string
  usage: TokenUsage | null
}

// What a conversation keeps between calls and never renders.
export type SessionRuntime = {
  agent: Agent | null
  unsubscribe: (() => void) | null
  compaction: AbortController | null
  busy: boolean
  rawMessages: AgentMessage[]
  persistedMessageCount: number
  statuses: Map<string, ToolStatus>
}

// A conversation held in memory: the open one, and any still answering in the background. Each
// has its own draft queue, since a queue keeps only the latest write it was given.
export type Session = {
  store: StoreApi<SessionState>
  runtime: SessionRuntime
  drafts: ReturnType<typeof createDraftQueue>
}

// A conversation answering in the background, or one whose reply ended there, delivered or
// failed, and is not yet seen.
export type Activity = 'running' | 'unread' | 'failed'

// The controller's own state: which conversation is open, and what spans conversations.
export type ConversationState = {
  activeId: ConversationId
  session: StoreApi<SessionState>
  switching: boolean
  activity: Record<ConversationId, Activity>
  storageError?: string
  view: ConversationView
  config: ConfigState
  history: {
    items: StoredConversation[]
    cursor: ConversationCursor | null
    loading: boolean
    error: string | null
  }
}

// What the panel renders: the controller's state with the open conversation's laid over it.
export type PanelState = Omit<ConversationState, 'session' | 'switching'> & {
  active: StoredConversation
  draft: string
  messages: ConversationMessage[]
  phase: ConversationPhase
  error?: string
  usage: TokenUsage | null
}

export type Runtime = {
  sessions: Map<ConversationId, Session>
  initialized: boolean
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
}

// One conversation, and the controller it belongs to.
export type SessionCtx = { app: Ctx; session: Session }

export const createSessionStore = (conversation: StoredConversation, phase: SessionPhase) =>
  createStore<SessionState>(() => ({
    conversation,
    draft: conversation.draft.text,
    messages: [],
    phase,
    usage: null,
  }))

export const createSessionRuntime = (): SessionRuntime => ({
  agent: null,
  unsubscribe: null,
  compaction: null,
  busy: false,
  rawMessages: [],
  persistedMessageCount: 0,
  statuses: new Map(),
})

export const createState = (session: StoreApi<SessionState>) =>
  createStore<ConversationState>(() => ({
    activeId: session.getState().conversation.id,
    session,
    switching: false,
    activity: {},
    view: 'chat',
    config: { kind: 'loading' },
    history: { items: [], cursor: null, loading: true, error: null },
  }))

export const createRuntime = (memoryAttached: boolean): Runtime => ({
  sessions: new Map(),
  initialized: false,
  persistedIds: new Set(),
  memoryAttached,
})

export const panelState = ({ session, switching, ...rest }: ConversationState): PanelState => {
  const open = session.getState()
  return {
    ...rest,
    active: open.conversation,
    draft: open.draft,
    messages: open.messages,
    phase: switching ? 'switching' : open.phase,
    error: open.error,
    usage: open.usage,
  }
}

export const getConversation = (s: SessionCtx) => s.session.store.getState().conversation

export const setConversation = (s: SessionCtx, conversation: StoredConversation) =>
  s.session.store.setState({ conversation })

export const isActive = (s: SessionCtx) => s.app.store.getState().activeId === getConversation(s).id

// The open conversation is always held in memory.
export const activeSession = (ctx: Ctx): SessionCtx => {
  const session = ctx.runtime.sessions.get(ctx.store.getState().activeId)
  if (!session) throw new Error('The open conversation is not in memory.')
  return { app: ctx, session }
}

export const setActivity = (ctx: Ctx, id: ConversationId, activity: Activity | null) =>
  ctx.store.setState(state => {
    const rest = Object.fromEntries(Object.entries(state.activity).filter(([key]) => key !== id))
    return { activity: activity ? { ...rest, [id]: activity } : rest }
  })

export const reportStorageError = (ctx: Ctx, cause: unknown) => {
  console.error('Unable to save conversation', cause)
  ctx.store.setState({
    storageError: 'Conversation changes could not be saved in this browser. We will retry.',
  })
}
