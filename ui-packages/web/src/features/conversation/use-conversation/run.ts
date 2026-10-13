import type { Agent } from '@earendil-works/pi-agent-core'
import {
  type ConversationDraft,
  conversationTitle,
  emptyConversationDraft,
  foldQueued,
} from '../../../core/conversations'
import { createReaderUserMessage, isReaderUserMessage } from '../../../core/reader-message'
import { compactConversation } from '../../assistant/compaction'
import { conversationMessages } from '../../assistant/create-reader-agent'
import { persistAgentMessages, refresh } from './agent-session'
import { queueDraft, restoreToDraft, takeQueued } from './drafts'
import { failedRun } from './messages'
import { nextActivityTime } from './session'
import { type Ctx, getActive, setActive } from './state'
import { nameConversation } from './titles'

// Queued messages join the run at its next turn; whatever is left when it stops, including after
// an abort, is sent as the next prompt. A failed run hands them back as the draft.
const run = async (ctx: Ctx, agent: Agent, batch: readonly ConversationDraft[]) => {
  const { runtime, store } = ctx
  runtime.busy = true
  store.setState({ error: undefined })
  try {
    for (let items = batch; items.length; items = takeQueued(ctx)) {
      store.setState({ phase: 'running' })
      const sending = items.map(item => ({
        item,
        message: createReaderUserMessage(item.text, item.attachments),
      }))
      try {
        await agent.prompt(sending.map(entry => entry.message))
      } catch (cause) {
        if (runtime.agent !== agent) return
        store.setState({
          error: cause instanceof Error ? cause.message : 'Could not send the message.',
        })
        const recorded = new Set(
          agent.state.messages.flatMap(item => (isReaderUserMessage(item) ? [item.reader.id] : [])),
        )
        const unsent = sending.filter(entry => !recorded.has(entry.message.reader.id))
        restoreToDraft(ctx, [...unsent.map(entry => entry.item), ...takeQueued(ctx)])
        return
      }
      if (runtime.agent !== agent) return
      nameConversation(ctx, agent, getActive(ctx).id, foldQueued(emptyConversationDraft(), items))
      if (failedRun(agent)) {
        restoreToDraft(ctx, takeQueued(ctx))
        return
      }
    }
  } finally {
    if (runtime.agent === agent) {
      runtime.busy = false
      runtime.statuses.forEach((status, id) => {
        if (status === 'Running') runtime.statuses.set(id, 'Stopped')
      })
      refresh(ctx, agent)
      store.setState({ phase: 'ready' })
    }
  }
}

// While a reply runs, sending queues the message instead.
export const send = (
  ctx: Ctx,
  { unsettled, hasAttachments }: { unsettled: boolean; hasAttachments: boolean },
) => {
  const { runtime, store } = ctx
  const agent = runtime.agent
  const text = store.getState().draft.trim()
  if (!agent || unsettled || (!text && !hasAttachments)) return
  const item = { text, attachments: ctx.attachments.takeReady().map(entry => entry.metadata) }
  const current = getActive(ctx)
  const queuing = runtime.busy
  const submitted = {
    ...current,
    title: current.title ?? conversationTitle(item),
    draft: emptyConversationDraft(),
    queued: queuing ? [...(current.queued ?? []), item] : current.queued,
    lastActiveAt: nextActivityTime(current),
  }
  setActive(ctx, submitted)
  void queueDraft(ctx, submitted, queuing)
  store.setState({ draft: '' })
  if (!queuing) void run(ctx, agent, [item])
}

export const stop = (ctx: Ctx) => {
  if (!ctx.runtime.busy) return
  ctx.store.setState({ phase: 'stopping' })
  ctx.runtime.agent?.abort()
}

// The summary is appended like any message, so the conversation is saved whole and the provider
// is sent the summary and what it kept from the next request on.
export const compact = async (ctx: Ctx) => {
  const { runtime, store } = ctx
  const agent = runtime.agent
  if (!agent || runtime.busy || runtime.switching) return
  const controller = new AbortController()
  runtime.compaction = controller
  runtime.busy = true
  store.setState({ error: undefined, phase: 'compacting' })
  try {
    const message = await compactConversation(
      agent.state.model,
      conversationMessages(agent),
      controller.signal,
    )
    if (runtime.agent !== agent) return
    if (!message) {
      store.setState({
        error: 'Nothing to compact yet: the conversation still fits in its recent context.',
      })
      return
    }
    agent.state.messages = [...agent.state.messages, message]
    refresh(ctx, agent)
    await persistAgentMessages(ctx, agent)
  } catch (cause) {
    if (runtime.agent !== agent || controller.signal.aborted) return
    console.error('Unable to compact the conversation', cause)
    store.setState({
      error: cause instanceof Error ? cause.message : 'Could not compact the conversation.',
    })
  } finally {
    if (runtime.compaction === controller) runtime.compaction = null
    if (runtime.agent === agent) {
      runtime.busy = false
      store.setState({ phase: 'ready' })
    }
  }
}
