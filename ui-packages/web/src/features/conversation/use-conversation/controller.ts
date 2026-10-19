import type { ConversationId } from '../../../core/conversations'
import type { ConversationAttachment } from '../../../core/reader-message'
import type { LocalTools } from '../../assistant/local-tools'
import { compact } from './compaction'
import { createDraftQueue } from './draft-queue'
import { attachmentsChanged, referenceFile, removeQueued, setDraft, writeDraft } from './drafts'
import { loadMore, reload } from './history'
import { deleteConversation, start, startNew, switchTo } from './navigation'
import { type SendRequest, send, stop } from './run'
import { createConversation } from './session'
import { configureModel, memoryChanged, refreshProviders, setWebSearch } from './settings'
import { type Ctx, createRuntime, createState, type DraftAttachmentsPort } from './state'
import { applyTitle } from './titles'

// The reading assistant's conversation, outside React: which conversation is open, its agent, the
// draft and the queue, and the list of past conversations. useConversation renders its store.
export const createConversationController = (
  tools: LocalTools,
  attachments: DraftAttachmentsPort,
  memoryOn: boolean,
) => {
  const ctx: Ctx = {
    store: createState(createConversation()),
    runtime: createRuntime(memoryOn),
    tools,
    attachments,
    drafts: createDraftQueue(conversation => writeDraft(ctx, conversation)),
  }
  return {
    store: ctx.store,
    start: () => start(ctx),
    setDraft: (text: string) => setDraft(ctx, text),
    referenceFile: (path: string) => referenceFile(ctx, path),
    attachmentsChanged: (ready: ConversationAttachment[]) => attachmentsChanged(ctx, ready),
    send: (request: SendRequest) => send(ctx, request),
    stop: () => stop(ctx),
    compact: () => compact(ctx),
    removeQueued: (index: number) => removeQueued(ctx, index),
    switchTo: (id: ConversationId) => switchTo(ctx, id),
    startNew: () => startNew(ctx),
    deleteConversation: (id: ConversationId) => deleteConversation(ctx, id),
    rename: (id: ConversationId, title: string) => applyTitle(ctx, id, title, 'reader'),
    reloadHistory: () => reload(ctx),
    loadMore: () => loadMore(ctx),
    configureModel: (selection: Parameters<typeof configureModel>[1]) =>
      configureModel(ctx, selection),
    setWebSearch: (on: boolean) => setWebSearch(ctx, on),
    refreshProviders: () => refreshProviders(ctx),
    memoryChanged: (on: boolean) => memoryChanged(ctx, on),
    showChat: () => ctx.store.setState({ view: 'chat' }),
    showHistory: () => ctx.store.setState({ view: 'history' }),
    dismissStorageError: () => ctx.store.setState({ storageError: undefined }),
  }
}

export type ConversationController = ReturnType<typeof createConversationController>
