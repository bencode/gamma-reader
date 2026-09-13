import { MessageSquare, X } from 'lucide-react'
import type { RefObject } from 'react'
import { ConversationComposer } from './conversation-composer'
import { useReaderConversation } from './conversation-context'
import { ConversationMessages } from './conversation-messages'

export const ConversationPanel = ({
  inputRef,
  onClose,
  onOpenFile,
  availableFileIds,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>
  onClose: () => void
  onOpenFile: (id: string) => void
  availableFileIds: ReadonlySet<string>
}) => {
  const { draft, setDraft, messages, phase, error, send, stop, draftAttachments } =
    useReaderConversation()
  const running = phase === 'running' || phase === 'stopping'
  const status =
    phase === 'connecting'
      ? 'Connecting…'
      : phase === 'unavailable'
        ? 'Chat is currently unavailable.'
        : undefined
  return (
    <aside className="conversation-panel panel-surface" aria-label="Reading assistant">
      <header className="panel-header">
        <h2>
          <MessageSquare size={16} />
          <span>Reading assistant</span>
        </h2>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close reading assistant"
          title="Close reading assistant"
        >
          <X size={17} />
        </button>
      </header>
      <ConversationMessages
        messages={messages}
        running={running}
        onOpenFile={onOpenFile}
        availableFileIds={availableFileIds}
      />
      <div className="composer-area">
        {status && (
          <p className="conversation-notice" role="status">
            {status}
          </p>
        )}
        {error && (
          <p className="conversation-notice" role="alert">
            {error}
          </p>
        )}
        <ConversationComposer
          inputRef={inputRef}
          draft={draft}
          phase={phase}
          attachments={draftAttachments.attachments}
          limitReached={draftAttachments.limitReached}
          unsettled={draftAttachments.unsettled}
          onDraftChange={setDraft}
          onAdd={files => void draftAttachments.add(files)}
          onRetry={key => void draftAttachments.retry(key)}
          onRemove={draftAttachments.remove}
          onOpenFile={onOpenFile}
          onSend={() => void send()}
          onStop={stop}
          availableFileIds={availableFileIds}
        />
      </div>
    </aside>
  )
}
