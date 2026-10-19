import type { ModelThinkingLevel } from '@earendil-works/pi-ai'
import type { ModelReference } from '@gamma-reader/shared/model-config'
import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import type { ConversationId } from '../../../core/conversations'
import type { ConversationReference } from '../../../core/reader-message'
import type { LocalTools } from '../../assistant/local-tools'
import { useMemoryEnabled } from '../../memory'
import type { FileLibrary } from '../../resources/use-file-library'
import { useDraftAttachments } from '../use-draft-attachments'
import { createConversationController } from './controller'
import { webSearchAvailable } from './session'

export type { ConversationMessage } from './messages'
export type { ConversationPhase, ConversationView } from './session'

// Renders the conversation controller and feeds it what lives in React: the draft attachments and
// the memory switch.
export const useConversation = (
  tools: LocalTools,
  addWorkspaceAttachments: FileLibrary['addAttachments'],
) => {
  const draftAttachments = useDraftAttachments(addWorkspaceAttachments)
  const memoryOn = useMemoryEnabled()
  const [controller] = useState(() =>
    createConversationController(tools, draftAttachments, memoryOn),
  )
  const state = useStore(controller.store)

  useEffect(() => {
    controller.attachmentsChanged(
      draftAttachments.attachments.flatMap(item =>
        item.status === 'ready' ? [item.metadata] : [],
      ),
    )
  }, [controller, draftAttachments.attachments])

  useEffect(() => controller.start(), [controller])

  useEffect(() => controller.memoryChanged(memoryOn), [controller, memoryOn])

  const { active, config, history, usage } = state
  const runtime = config.kind === 'enabled' ? config.runtime : null
  const selection = active.selection
  const contextWindow = runtime?.providers
    .flatMap(provider => provider.models)
    .find(
      model => model.provider === selection?.provider && model.id === selection.modelId,
    )?.contextWindow

  return {
    active,
    draft: state.draft,
    setDraft: controller.setDraft,
    messages: state.messages,
    phase: state.phase,
    error: state.error,
    storageError: state.storageError,
    dismissStorageError: controller.dismissStorageError,
    view: state.view,
    showChat: controller.showChat,
    showHistory: controller.showHistory,
    historyItems: history.items,
    historyLoading: history.loading,
    historyError: history.error,
    historyHasMore: history.cursor !== null,
    reloadHistory: controller.reloadHistory,
    loadMore: controller.loadMore,
    switchTo: controller.switchTo,
    startNew: controller.startNew,
    deleteConversation: controller.deleteConversation,
    renameConversation: (id: ConversationId, title: string) => controller.rename(id, title),
    send: (references: readonly ConversationReference[]) =>
      controller.send({
        unsettled: draftAttachments.unsettled,
        hasAttachments: draftAttachments.attachments.length > 0,
        references,
      }),
    stop: controller.stop,
    compact: controller.compact,
    queued: active.queued ?? [],
    removeQueued: controller.removeQueued,
    draftAttachments,
    // A window of 0 is one the catalog does not know.
    tokenUsage: usage && { ...usage, contextWindow: contextWindow || undefined },
    modelConfiguration: runtime && selection ? { providers: runtime.providers, selection } : null,
    webSearch: webSearchAvailable(config)
      ? { enabled: Boolean(active.webSearch), set: controller.setWebSearch }
      : null,
    selectModel: (model: ModelReference) => {
      if (selection) controller.configureModel({ ...model, effort: selection.effort })
    },
    refreshProviders: controller.refreshProviders,
    selectEffort: (effort: ModelThinkingLevel) => {
      if (selection) controller.configureModel({ ...selection, effort })
    },
  }
}
