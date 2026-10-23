import {
  type ConversationDraft,
  foldQueued,
  type StoredConversation,
} from '../../../core/conversations'
import type { ConversationAttachment } from '../../../core/reader-message'
import { saveStoredConversationDraft } from '../../../data/conversation-store'
import { appendMention, type NamedFile } from '../composer/file-mentions'
import { isPersisted, placeFirst } from './history'
import { activeConversationKey, nextActivityTime } from './session'
import {
  activeSession,
  type Ctx,
  getConversation,
  isActive,
  reportStorageError,
  type SessionCtx,
  setConversation,
} from './state'

// Written by the conversation's draft queue, one at a time.
export const writeDraft = async (s: SessionCtx, conversation: StoredConversation) => {
  try {
    await saveStoredConversationDraft(conversation)
    placeFirst(s.app, conversation)
    if (isActive(s)) localStorage.setItem(activeConversationKey(), conversation.id)
    s.app.store.setState({ storageError: undefined })
  } catch (cause) {
    reportStorageError(s.app, cause)
  }
}

// A conversation not yet in storage is saved only once it holds something.
export const queueDraft = (s: SessionCtx, conversation: StoredConversation, saveEmpty = false) => {
  const hasDraft = Boolean(conversation.draft.text.trim() || conversation.draft.attachments.length)
  if (!isPersisted(s.app, conversation.id) && !hasDraft && !saveEmpty) return Promise.resolve()
  return s.session.drafts.queue(conversation)
}

// The open conversation's attachments are in the tray; another's wait in its saved draft.
export const currentDraft = (
  s: SessionCtx,
  text = s.session.store.getState().draft,
): ConversationDraft => ({
  text,
  attachments: isActive(s) ? s.app.attachments.ready() : getConversation(s).draft.attachments,
})

export const updateDraft = (s: SessionCtx, nextDraft: ConversationDraft) => {
  const current = getConversation(s)
  const next = { ...current, draft: nextDraft, lastActiveAt: nextActivityTime(current) }
  setConversation(s, next)
  void queueDraft(s, next)
}

export const setQueued = (s: SessionCtx, queued: ConversationDraft[]) =>
  setConversation(s, { ...getConversation(s), queued })

// Not saved here: the next message_end writes the emptied queue and the message in one transaction.
export const takeQueued = (s: SessionCtx) => {
  const queued = getConversation(s).queued ?? []
  if (queued.length) setQueued(s, [])
  return queued
}

export const restoreToDraft = (s: SessionCtx, items: readonly ConversationDraft[]) => {
  if (!items.length) return
  const next = foldQueued(currentDraft(s), items)
  s.session.store.setState({ draft: next.text })
  if (isActive(s)) s.app.attachments.restore(items.flatMap(item => item.attachments))
  updateDraft(s, next)
}

export const setDraft = (ctx: Ctx, text: string) => {
  const s = activeSession(ctx)
  s.session.store.setState({ draft: text })
  if (ctx.runtime.initialized) updateDraft(s, currentDraft(s, text))
}

// Read at call time, so a file row can add a reference without following every keystroke.
export const referenceFile = (ctx: Ctx, file: NamedFile, files: readonly NamedFile[]) =>
  setDraft(ctx, appendMention(activeSession(ctx).session.store.getState().draft, file, files))

export const removeQueued = (ctx: Ctx, index: number) => {
  const s = activeSession(ctx)
  setQueued(
    s,
    (getConversation(s).queued ?? []).filter((_, position) => position !== index),
  )
  void queueDraft(s, getConversation(s), true)
}

// The attachments the reader has added so far, saved with the draft as they change.
export const attachmentsChanged = (ctx: Ctx, ready: ConversationAttachment[]) => {
  if (!ctx.runtime.initialized || ctx.store.getState().switching) return
  const s = activeSession(ctx)
  updateDraft(s, { text: s.session.store.getState().draft, attachments: ready })
}
