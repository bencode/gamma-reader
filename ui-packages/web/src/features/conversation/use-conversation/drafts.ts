import {
  type ConversationDraft,
  foldQueued,
  type StoredConversation,
} from '../../../core/conversations'
import type { ConversationAttachment } from '../../../core/reader-message'
import { saveStoredConversationDraft } from '../../../data/conversation-store'
import { appendMention } from '../composer/file-mentions'
import { isPersisted, placeFirst } from './history'
import { activeConversationKey, nextActivityTime } from './session'
import { type Ctx, getActive, reportStorageError, setActive } from './state'

// Written by the draft queue, one at a time.
export const writeDraft = async (ctx: Ctx, conversation: StoredConversation) => {
  try {
    await saveStoredConversationDraft(conversation)
    placeFirst(ctx, conversation)
    localStorage.setItem(activeConversationKey(), conversation.id)
    ctx.store.setState({ storageError: undefined })
  } catch (cause) {
    reportStorageError(ctx, cause)
  }
}

// A conversation not yet in storage is saved only once it holds something.
export const queueDraft = (ctx: Ctx, conversation: StoredConversation, saveEmpty = false) => {
  const hasDraft = Boolean(conversation.draft.text.trim() || conversation.draft.attachments.length)
  if (!isPersisted(ctx, conversation.id) && !hasDraft && !saveEmpty) return Promise.resolve()
  return ctx.drafts.queue(conversation)
}

export const currentDraft = (ctx: Ctx, text = ctx.store.getState().draft): ConversationDraft => ({
  text,
  attachments: ctx.attachments.ready(),
})

export const updateActiveDraft = (ctx: Ctx, nextDraft: ConversationDraft) => {
  const current = getActive(ctx)
  const next = { ...current, draft: nextDraft, lastActiveAt: nextActivityTime(current) }
  setActive(ctx, next)
  void queueDraft(ctx, next)
}

export const setQueued = (ctx: Ctx, queued: ConversationDraft[]) =>
  setActive(ctx, { ...getActive(ctx), queued })

// Not saved here: the next message_end writes the emptied queue and the message in one transaction.
export const takeQueued = (ctx: Ctx) => {
  const queued = getActive(ctx).queued ?? []
  if (queued.length) setQueued(ctx, [])
  return queued
}

export const restoreToDraft = (ctx: Ctx, items: readonly ConversationDraft[]) => {
  if (!items.length) return
  const next = foldQueued(currentDraft(ctx), items)
  ctx.store.setState({ draft: next.text })
  ctx.attachments.restore(items.flatMap(item => item.attachments))
  updateActiveDraft(ctx, next)
}

export const setDraft = (ctx: Ctx, text: string) => {
  ctx.store.setState({ draft: text })
  if (ctx.runtime.initialized) updateActiveDraft(ctx, currentDraft(ctx, text))
}

// Read at call time, so a file row can add a reference without following every keystroke.
export const referenceFile = (ctx: Ctx, path: string) =>
  setDraft(ctx, appendMention(ctx.store.getState().draft, path))

export const removeQueued = (ctx: Ctx, index: number) => {
  setQueued(
    ctx,
    (getActive(ctx).queued ?? []).filter((_, position) => position !== index),
  )
  void queueDraft(ctx, getActive(ctx), true)
}

// The attachments the reader has added so far, saved with the draft as they change.
export const attachmentsChanged = (ctx: Ctx, ready: ConversationAttachment[]) => {
  if (!ctx.runtime.initialized || ctx.runtime.switching) return
  updateActiveDraft(ctx, { text: ctx.store.getState().draft, attachments: ready })
}
