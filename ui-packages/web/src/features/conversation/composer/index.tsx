import { type DragEvent, type RefObject, useState } from 'react'
import type {
  ConversationDraft,
  ConversationId,
  StoredConversation,
} from '../../../core/conversations'
import type { FileReference } from '../../../core/reader-message'
import { DraftAttachmentTray } from '../conversation-attachments'
import type { ModelControlProps } from '../model-control'
import type { ConversationTokenUsage } from '../token-usage'
import type { ConversationPhase } from '../use-conversation'
import type { DraftAttachment } from '../use-draft-attachments'
import { ComposerToolbar, type PluginSwitch } from './composer-toolbar'
import { DraftInput } from './draft-input'
import { QueuedMessages } from './queued-messages'
import type { SlashCommand } from './slash-command-menu'
import styles from './style.module.scss'

type ComposerProps = {
  modelConfiguration: Pick<ModelControlProps, 'providers' | 'selection'> | null
  onModelChange: ModelControlProps['onModelChange']
  onEffortChange: ModelControlProps['onEffortChange']
  onConfigureModels: ModelControlProps['onConfigure']
  tokenUsage: ConversationTokenUsage | null
  inputRef: RefObject<HTMLTextAreaElement | null>
  draft: string
  phase: ConversationPhase
  queued: readonly ConversationDraft[]
  onRemoveQueued: (index: number) => void
  attachments: DraftAttachment[]
  limitReached: boolean
  unsettled: boolean
  onDraftChange: (value: string) => void
  onAdd: (files: readonly File[]) => void
  onRetry: (key: string) => void
  onRemove: (key: string) => void
  onOpenFile: (id: string) => void
  onSend: (references: FileReference[]) => void
  onStop: () => void
  availableFileIds: ReadonlySet<string>
  // The project's files, offered after an @.
  files: readonly FileReference[]
  // Newest first; recently opened files lead the @ list.
  recentFileIds: readonly string[]
  // The project's conversations, offered after a #; read each time a # starts.
  loadConversations: () => Promise<StoredConversation[]>
  activeConversationId: ConversationId
  commands: readonly SlashCommand[]
  // Absent where the server has no search service.
  webSearch: { enabled: boolean; set: (on: boolean) => void } | null
  plugins: readonly PluginSwitch[]
  onPluginChange: (name: string, on: boolean) => void
}

export const ConversationComposer = ({
  inputRef,
  modelConfiguration,
  onModelChange,
  onEffortChange,
  onConfigureModels,
  tokenUsage,
  draft,
  phase,
  queued,
  onRemoveQueued,
  attachments,
  limitReached,
  unsettled,
  onDraftChange,
  onAdd,
  onRetry,
  onRemove,
  onOpenFile,
  onSend,
  onStop,
  availableFileIds,
  files,
  recentFileIds,
  loadConversations,
  activeConversationId,
  commands,
  webSearch,
  plugins,
  onPluginChange,
}: ComposerProps) => {
  const [dragging, setDragging] = useState(false)
  const readyAttachments = attachments.filter(item => item.status === 'ready')
  const hasUnavailable = readyAttachments.some(item => !availableFileIds.has(item.metadata.id))

  const addDroppedFiles = (event: DragEvent<HTMLFieldSetElement>) => {
    event.preventDefault()
    setDragging(false)
    const files = Array.from(event.dataTransfer.files)
    if (files.length) onAdd(files)
  }

  return (
    <fieldset
      disabled={phase === 'loading' || phase === 'switching'}
      aria-label="Message composer"
      className={`${styles.composer}${dragging ? ` ${styles.dropActive}` : ''}`}
      onDragEnter={event => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault()
          setDragging(true)
        }
      }}
      onDragOver={event => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault()
      }}
      onDragLeave={event => {
        const next = event.relatedTarget
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) setDragging(false)
      }}
      onDrop={addDroppedFiles}
    >
      <div className={styles.box}>
        <QueuedMessages queued={queued} onRemove={onRemoveQueued} />
        <DraftAttachmentTray
          attachments={attachments}
          onOpen={onOpenFile}
          onRetry={onRetry}
          onRemove={onRemove}
          availableFileIds={availableFileIds}
        />
        <DraftInput
          inputRef={inputRef}
          draft={draft}
          phase={phase}
          onDraftChange={onDraftChange}
          onSend={onSend}
          onStop={onStop}
          onAdd={onAdd}
          files={files}
          recentFileIds={recentFileIds}
          loadConversations={loadConversations}
          activeConversationId={activeConversationId}
          commands={commands}
          attachmentsReady={readyAttachments.length > 0}
          sendBlocked={unsettled || hasUnavailable}
        />
        {dragging && <span className={styles.dropHint}>Drop files to attach</span>}
      </div>
      <ComposerToolbar
        onAdd={onAdd}
        limitReached={limitReached}
        adding={attachments.some(item => item.status === 'adding')}
        webSearch={webSearch}
        plugins={plugins}
        onPluginChange={onPluginChange}
        modelConfiguration={modelConfiguration}
        modelDisabled={phase !== 'ready'}
        onModelChange={onModelChange}
        onEffortChange={onEffortChange}
        onConfigureModels={onConfigureModels}
        tokenUsage={tokenUsage}
      />
    </fieldset>
  )
}
