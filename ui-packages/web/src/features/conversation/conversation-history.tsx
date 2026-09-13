import { ArrowLeft, MoreHorizontal, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ConversationId, StoredConversation } from '../../core/conversations'

type DeleteState =
  | { kind: 'none' }
  | { kind: 'confirming'; id: ConversationId }
  | { kind: 'deleting'; id: ConversationId }
  | { kind: 'failed'; id: ConversationId; message: string }

export type ConversationHistoryProps = {
  items: readonly StoredConversation[]
  activeId: ConversationId
  loading: boolean
  error: string | null
  hasMore: boolean
  switching: boolean
  onBack: () => void
  onNew: () => void
  onSelect: (id: ConversationId) => void
  onLoadMore: () => void
  onDelete: (id: ConversationId) => Promise<void>
}

const activityTime = (timestamp: number) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    ...(new Date(timestamp).getFullYear() === new Date().getFullYear()
      ? { hour: 'numeric', minute: '2-digit' }
      : { year: 'numeric' }),
  }).format(timestamp)

export const ConversationHistory = ({
  items,
  activeId,
  loading,
  error,
  hasMore,
  switching,
  onBack,
  onNew,
  onSelect,
  onLoadMore,
  onDelete,
}: ConversationHistoryProps) => {
  const [deleting, setDeleting] = useState<DeleteState>({ kind: 'none' })
  const scrollRef = useRef<HTMLDivElement>(null)
  const previousActiveId = useRef(activeId)

  useEffect(() => {
    if (previousActiveId.current !== activeId && scrollRef.current) scrollRef.current.scrollTop = 0
    previousActiveId.current = activeId
  }, [activeId])

  const remove = async (id: ConversationId) => {
    setDeleting({ kind: 'deleting', id })
    try {
      await onDelete(id)
      setDeleting({ kind: 'none' })
    } catch (cause) {
      setDeleting({
        kind: 'failed',
        id,
        message: cause instanceof Error ? cause.message : 'Conversation could not be deleted.',
      })
    }
  }

  return (
    <section className="conversation-history" aria-label="Conversation history">
      <header className="conversation-history-header">
        <button type="button" className="icon-button" onClick={onBack} aria-label="Back to chat">
          <ArrowLeft size={17} />
        </button>
        <h2>History</h2>
        <button
          type="button"
          className="icon-button"
          onClick={onNew}
          disabled={switching}
          aria-label="New conversation"
          title="New conversation"
        >
          <Plus size={17} />
        </button>
      </header>
      <div className="conversation-history-scroll" ref={scrollRef}>
        {items.length === 0 && !loading && !error && (
          <p className="conversation-history-empty">Your conversations will appear here.</p>
        )}
        <ol className="conversation-history-list">
          {items.map(conversation => {
            const deleteOpen = deleting.kind !== 'none' && deleting.id === conversation.id
            const deletePending = deleting.kind === 'deleting' && deleting.id === conversation.id
            return (
              <li
                key={conversation.id}
                className={conversation.id === activeId ? 'active' : undefined}
              >
                <div className="conversation-history-row">
                  <button
                    type="button"
                    className="conversation-history-main"
                    disabled={switching || deletePending}
                    onClick={() => onSelect(conversation.id)}
                  >
                    <strong>{conversation.title ?? 'New conversation'}</strong>
                    <time dateTime={new Date(conversation.lastActiveAt).toISOString()}>
                      {activityTime(conversation.lastActiveAt)}
                    </time>
                  </button>
                  <button
                    type="button"
                    className="icon-button conversation-history-more"
                    aria-label={`More actions for ${conversation.title ?? 'New conversation'}`}
                    aria-expanded={deleteOpen}
                    disabled={switching || deletePending}
                    onClick={() =>
                      setDeleting(current =>
                        current.kind !== 'none' && current.id === conversation.id
                          ? { kind: 'none' }
                          : { kind: 'confirming', id: conversation.id },
                      )
                    }
                  >
                    {deleteOpen ? <X size={15} /> : <MoreHorizontal size={16} />}
                  </button>
                </div>
                {deleteOpen && (
                  <div className="conversation-delete-confirmation">
                    <span>
                      {deleting.kind === 'failed' ? deleting.message : 'Delete this conversation?'}
                    </span>
                    <button
                      type="button"
                      disabled={deletePending}
                      onClick={() => void remove(conversation.id)}
                    >
                      <Trash2 size={13} />
                      {deletePending ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
        {hasMore && !error && (
          <button
            type="button"
            className="conversation-history-load-more"
            disabled={loading || switching}
            onClick={onLoadMore}
          >
            {loading ? 'Loading…' : 'Show 30 more'}
          </button>
        )}
        {error && (
          <div className="conversation-history-feedback" role="alert">
            <span>{error}</span>
            <button type="button" onClick={onLoadMore}>
              Try again
            </button>
          </div>
        )}
        {!error && loading && items.length === 0 && (
          <p className="conversation-history-feedback" role="status">
            Loading conversations…
          </p>
        )}
      </div>
    </section>
  )
}
