import { createStore } from 'zustand/vanilla'
import type { ConversationId } from '../../../core/conversations'
import type { ConversationAttachment } from '../../../core/reader-message'
import type { LocalTools } from '../../assistant/local-tools'
import type { NamedFile } from '../composer/file-mentions'
import { addSession } from './agent-session'
import { compact } from './compaction'
import { attachmentsChanged, referenceFile, removeQueued, setDraft } from './drafts'
import { loadMore, reload } from './history'
import { deleteConversation, start, startNew, switchTo } from './navigation'
import { type SendRequest, send, stop } from './run'
import { createConversation } from './session'
import { configureModel, memoryChanged, refreshProviders, setWebSearch } from './settings'
import {
  type Ctx,
  createRuntime,
  createSessionStore,
  createState,
  type DraftAttachmentsPort,
  type PanelState,
  panelState,
} from './state'
import { applyTitle } from './titles'

// The reading assistant's conversations, outside React: the open one with its draft and queue,
// any answering in the background, and the list of past conversations. useConversation renders
// its store, which follows the open conversation.
export const createConversationController = (
  tools: LocalTools,
  attachments: DraftAttachmentsPort,
  memoryOn: boolean,
) => {
  const first = createSessionStore(createConversation(), 'loading')
  const ctx: Ctx = {
    store: createState(first),
    runtime: createRuntime(memoryOn),
    tools,
    attachments,
  }
  addSession(ctx, first)

  const store = createStore<PanelState>(() => panelState(ctx.store.getState()))
  const sync = () => store.setState(panelState(ctx.store.getState()), true)
  let unsubscribeSession = first.subscribe(sync)
  ctx.store.subscribe((state, previous) => {
    if (state.session !== previous.session) {
      unsubscribeSession()
      unsubscribeSession = state.session.subscribe(sync)
    }
    sync()
  })

  return {
    store,
    start: () => start(ctx),
    setDraft: (text: string) => setDraft(ctx, text),
    referenceFile: (file: NamedFile, files: readonly NamedFile[]) =>
      referenceFile(ctx, file, files),
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
