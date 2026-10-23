import { History, MessageSquare, Plus, X } from 'lucide-react'
import { Activity, type RefObject, useState } from 'react'
import { conversationNumber } from '../../core/conversations'
import type { FileReference } from '../../core/reader-message'
import { listAllStoredConversations } from '../../data/conversation-store'
import { ModelProviderDialog } from '../settings/model-providers'
import { ConversationComposer } from './composer'
import { useReaderConversation } from './conversation-context'
import { ConversationHistory } from './conversation-history'
import { ConversationMessages } from './conversation-messages'
import { ShortcutsDialog } from './shortcuts-dialog'

export const ConversationPanel = ({
  inputRef,
  onClose,
  onOpenFile,
  availableFileIds,
  files,
  recentFileIds,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>
  onClose: () => void
  onOpenFile: (id: string) => void
  availableFileIds: ReadonlySet<string>
  files: readonly FileReference[]
  recentFileIds: readonly string[]
}) => {
  const conversation = useReaderConversation()
  const [configuringModels, setConfiguringModels] = useState(false)
  const [showingShortcuts, setShowingShortcuts] = useState(false)
  const [copiedNumber, setCopiedNumber] = useState(false)
  const {
    active,
    draft,
    setDraft,
    messages,
    phase,
    error,
    storageError,
    dismissStorageError,
    view,
    showChat,
    showHistory,
    historyItems,
    historyLoading,
    historyError,
    historyHasMore,
    reloadHistory,
    loadMore,
    switchTo,
    startNew,
    deleteConversation,
    renameConversation,
    send,
    stop,
    compact,
    queued,
    removeQueued,
    draftAttachments,
  } = conversation
  const running = phase === 'running' || phase === 'stopping'
  const commands = [
    { name: 'clear', description: 'Start a new conversation', run: () => void startNew() },
    {
      name: 'compact',
      description: 'Summarize earlier messages to free up context',
      run: () => void compact(),
    },
    { name: 'shortcuts', description: 'Keyboard shortcuts', run: () => setShowingShortcuts(true) },
  ]
  const switching = phase === 'switching'
  const number = `#${conversationNumber(active.id)}`
  const copyNumber = () =>
    navigator.clipboard.writeText(number).then(
      () => {
        setCopiedNumber(true)
        setTimeout(() => setCopiedNumber(false), 1500)
      },
      cause => console.error('Unable to copy the conversation number', cause),
    )
  const status =
    phase === 'loading'
      ? 'Opening conversation…'
      : phase === 'connecting'
        ? 'Connecting…'
        : phase === 'unavailable'
          ? 'Chat is currently unavailable.'
          : phase === 'compacting'
            ? 'Summarizing earlier messages…'
            : undefined
  return (
    <aside className="conversation-panel panel-surface" aria-label="Reading assistant">
      <Activity mode={view === 'chat' ? 'visible' : 'hidden'}>
        <div className="conversation-view">
          <header className="panel-header conversation-header">
            <h2 title={active.title ?? 'New conversation'}>
              <MessageSquare size={16} />
              <span>{active.title ?? 'New conversation'}</span>
            </h2>
            {/* A title comes with the first saved message, so a conversation without one has no
                record to read yet. */}
            {active.title !== null && (
              <button
                type="button"
                className="conversation-number"
                aria-label={`Copy conversation number ${number}`}
                title="Copy conversation number"
                onClick={() => void copyNumber()}
              >
                {copiedNumber ? 'Copied' : number}
              </button>
            )}
            <div className="conversation-header-actions">
              <button
                type="button"
                className="icon-button"
                onClick={() => void startNew()}
                disabled={switching}
                aria-label="New conversation"
                title="New conversation"
              >
                <Plus size={17} />
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={showHistory}
                disabled={switching}
                aria-label="Conversation history"
                title="Conversation history"
              >
                <History size={16} />
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={onClose}
                aria-label="Close reading assistant"
                title="Close reading assistant"
              >
                <X size={17} />
              </button>
            </div>
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
            {storageError && (
              <div className="conversation-storage-warning" role="alert">
                <span>{storageError}</span>
                <button
                  type="button"
                  className="icon-button"
                  onClick={dismissStorageError}
                  aria-label="Dismiss storage warning"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            <ConversationComposer
              modelConfiguration={conversation.modelConfiguration}
              onModelChange={conversation.selectModel}
              onEffortChange={conversation.selectEffort}
              onConfigureModels={() => setConfiguringModels(true)}
              tokenUsage={conversation.tokenUsage}
              inputRef={inputRef}
              draft={draft}
              phase={phase}
              queued={queued}
              onRemoveQueued={removeQueued}
              attachments={draftAttachments.attachments}
              limitReached={draftAttachments.limitReached}
              unsettled={draftAttachments.unsettled}
              onDraftChange={setDraft}
              onAdd={files => void draftAttachments.add(files)}
              onRetry={key => void draftAttachments.retry(key)}
              onRemove={draftAttachments.remove}
              onOpenFile={onOpenFile}
              onSend={send}
              onStop={stop}
              availableFileIds={availableFileIds}
              files={files}
              recentFileIds={recentFileIds}
              loadConversations={listAllStoredConversations}
              activeConversationId={active.id}
              commands={commands}
              webSearch={conversation.webSearch}
            />
          </div>
        </div>
      </Activity>
      <Activity mode={view === 'history' ? 'visible' : 'hidden'}>
        <ConversationHistory
          items={historyItems}
          activeId={active.id}
          loading={historyLoading}
          error={historyError}
          hasMore={historyHasMore}
          switching={switching}
          onBack={showChat}
          onNew={() => void startNew()}
          onSelect={id => void switchTo(id)}
          onLoadMore={() => void (historyItems.length ? loadMore() : reloadHistory())}
          onDelete={deleteConversation}
          onRename={renameConversation}
        />
      </Activity>
      {configuringModels && (
        <ModelProviderDialog
          onClose={() => {
            setConfiguringModels(false)
            // Models added while this was open only reach the list once the
            // runtime is rebuilt; without this a reader configures a key and
            // sees nothing change until they reload.
            conversation.refreshProviders().catch((cause: unknown) => {
              console.error('Unable to pick up the configured model providers', cause)
            })
          }}
        />
      )}
      {showingShortcuts && <ShortcutsDialog onClose={() => setShowingShortcuts(false)} />}
    </aside>
  )
}
