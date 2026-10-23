import type { Agent } from '@earendil-works/pi-agent-core'
import {
  type ConversationDraft,
  conversationTitle,
  emptyConversationDraft,
  foldQueued,
} from '../../../core/conversations'
import {
  createReaderUserMessage,
  type FileReference,
  isReaderUserMessage,
} from '../../../core/reader-message'
import { refresh, releaseSession } from './agent-session'
import { compactBeforeSending, recoverFromOverflow } from './compaction'
import { queueDraft, restoreToDraft, takeQueued } from './drafts'
import { failedRun } from './messages'
import { nextActivityTime } from './session'
import {
  activeSession,
  type Ctx,
  getConversation,
  isActive,
  type SessionCtx,
  setActivity,
  setConversation,
} from './state'
import { nameConversation } from './titles'

// A reply that ends in the open conversation simply ends; one that ends in the background marks
// its conversation unread and lets it leave memory.
const settle = (s: SessionCtx) => {
  const { id } = getConversation(s)
  if (isActive(s)) return setActivity(s.app, id, null)
  setActivity(s.app, id, 'unread')
  releaseSession(s)
}

// Queued messages join the run at its next turn; whatever is left when it stops, including after
// an abort, is sent as the next prompt. A failed run hands them back as the draft.
const run = async (s: SessionCtx, agent: Agent, batch: readonly ConversationDraft[]) => {
  const { runtime, store } = s.session
  runtime.busy = true
  setActivity(s.app, getConversation(s).id, 'running')
  store.setState({ error: undefined })
  try {
    for (let items = batch; items.length; items = takeQueued(s)) {
      store.setState({ phase: 'running' })
      const sending = items.map(item => ({
        item,
        message: createReaderUserMessage(item.text, item.attachments, item.references),
      }))
      const messages = sending.map(entry => entry.message)
      // Stopped while compacting: nothing was sent, so the messages go back to the draft.
      if (!(await compactBeforeSending(s, agent, messages))) {
        if (runtime.agent === agent) restoreToDraft(s, [...items, ...takeQueued(s)])
        return
      }
      store.setState({ phase: 'running' })
      try {
        await agent.prompt(messages)
        if (runtime.agent === agent) await recoverFromOverflow(s, agent)
      } catch (cause) {
        if (runtime.agent !== agent) return
        store.setState({
          error: cause instanceof Error ? cause.message : 'Could not send the message.',
        })
        const recorded = new Set(
          agent.state.messages.flatMap(item => (isReaderUserMessage(item) ? [item.reader.id] : [])),
        )
        const unsent = sending.filter(entry => !recorded.has(entry.message.reader.id))
        restoreToDraft(s, [...unsent.map(entry => entry.item), ...takeQueued(s)])
        return
      }
      if (runtime.agent !== agent) return
      nameConversation(s, agent, foldQueued(emptyConversationDraft(), items))
      if (failedRun(agent)) {
        restoreToDraft(s, takeQueued(s))
        return
      }
    }
  } finally {
    if (runtime.agent === agent) {
      runtime.busy = false
      runtime.statuses.forEach((status, id) => {
        if (status === 'Running') runtime.statuses.set(id, 'Stopped')
      })
      refresh(s, agent)
      store.setState({ phase: 'ready' })
      settle(s)
    }
  }
}

export type SendRequest = {
  unsettled: boolean
  hasAttachments: boolean
  references?: readonly FileReference[]
}

// While a reply runs, sending queues the message instead.
export const send = (ctx: Ctx, { unsettled, hasAttachments, references = [] }: SendRequest) => {
  if (ctx.store.getState().switching) return
  const s = activeSession(ctx)
  const { runtime, store } = s.session
  const agent = runtime.agent
  const { draft, phase } = store.getState()
  if (phase !== 'ready' && phase !== 'running') return
  const text = draft.trim()
  if (!agent || unsettled || (!text && !hasAttachments)) return
  const item = {
    text,
    attachments: ctx.attachments.takeReady().map(entry => entry.metadata),
    references: references.map(({ id, path, previewKind }) => ({ id, path, previewKind })),
  }
  const current = getConversation(s)
  const queuing = runtime.busy
  const submitted = {
    ...current,
    title: current.title ?? conversationTitle(item),
    draft: emptyConversationDraft(),
    queued: queuing ? [...(current.queued ?? []), item] : current.queued,
    lastActiveAt: nextActivityTime(current),
  }
  setConversation(s, submitted)
  void queueDraft(s, submitted, queuing)
  store.setState({ draft: '' })
  if (!queuing) void run(s, agent, [item])
}

export const stop = (ctx: Ctx) => {
  const { runtime, store } = activeSession(ctx).session
  if (!runtime.busy) return
  store.setState({ phase: 'stopping' })
  runtime.compaction?.abort()
  runtime.agent?.abort()
}
