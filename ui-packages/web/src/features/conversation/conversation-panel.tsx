import { ChevronDown, History, LoaderCircle, MessageSquare, Plus, X } from 'lucide-react'
import { Activity, type RefObject, useId, useState } from 'react'
import { conversationNumber } from '../../core/conversations'
import type { FileReference } from '../../core/reader-message'
import { listAllStoredConversations } from '../../data/conversation-store'
import { ModelProviderDialog } from '../settings/model-providers'
import { ConversationComposer } from './composer'
import { useReaderConversation } from './conversation-context'
import { ConversationHistory } from './conversation-history'
import { ConversationMessages } from './conversation-messages'
import { recentConversations } from './recent-conversations'
import { ReplyAnnouncement } from './reply-announcement'
import { SessionList } from './session-list'
import { useSessionListOpen } from './session-list-preference'
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
  const [listOpen, setListOpen] = useSessionListOpen()
  const listId = useId()
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
    activity,
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
  const title = active.title ?? 'New conversation'
  const answering = Object.values(activity).filter(state => state === 'running').length
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
          ? 'No chat model is configured. Add your own key to chat.'
          : phase === 'compacting'
            ? 'Summarizing earlier messages…'
            : undefined
  return (
    <aside className="conversation-panel panel-surface" aria-label="Reading assistant">
      <Activity mode={view === 'chat' ? 'visible' : 'hidden'}>
        <div className="conversation-view">
          <header className="panel-header conversation-header">
            <h2>
              <button
                type="button"
                className="conversation-switcher"
                aria-label={answering ? `${title}, ${answering} answering` : title}
                aria-expanded={listOpen}
                aria-controls={listOpen ? listId : undefined}
                title={listOpen ? 'Hide recent conversations' : 'Show recent conversations'}
                onClick={() => setListOpen(!listOpen)}
              >
                <MessageSquare size={16} aria-hidden="true" />
                <span className="conversation-switcher-title">{title}</span>
                <ChevronDown
                  className="conversation-switcher-chevron"
                  size={14}
                  aria-hidden="true"
                />
                {answering > 0 && (
                  <span className="conversation-answering">
                    <LoaderCircle className="session-spinner" size={11} aria-hidden="true" />
                    {answering}
                  </span>
                )}
              </button>
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
          {listOpen && (
            <SessionList
              id={listId}
              conversations={recentConversations(historyItems, active, activity)}
              activeId={active.id}
              activity={activity}
              onSelect={id => void switchTo(id)}
              onShowHistory={showHistory}
            />
          )}
          <ConversationMessages
            messages={messages}
            running={running}
            onOpenFile={onOpenFile}
            availableFileIds={availableFileIds}
          />
          <ReplyAnnouncement
            conversationId={active.id}
            phase={phase}
            whole={messages.at(-1)?.copyable === true}
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
            {/* The model select that normally carries this entry is absent exactly when no
                model exists, so the composer area offers it itself. */}
            {phase === 'unavailable' && (
              <button
                type="button"
                className="text-button"
                onClick={() => setConfiguringModels(true)}
              >
                Add a model to chat
              </button>
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
              plugins={conversation.plugins}
              onPluginChange={conversation.setPlugin}
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
