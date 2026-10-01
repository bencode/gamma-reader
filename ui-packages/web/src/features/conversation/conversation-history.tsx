import { ArrowLeft, MoreHorizontal, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ConversationId, StoredConversation } from '../../core/conversations'

type RowState =
  | { kind: 'none' }
  | { kind: 'actions'; id: ConversationId }
  | { kind: 'renaming'; id: ConversationId }
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
  onRename: (id: ConversationId, title: string) => Promise<void>
}

// The field keeps whatever the reader typed until they leave it; Escape leaves it unchanged.
const RenameField = ({
  title,
  onDone,
}: {
  title: string
  onDone: (title: string | null) => void
}) => {
  const ref = useRef<HTMLInputElement>(null)
  const settled = useRef(false)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const finish = (next: string | null) => {
    if (settled.current) return
    settled.current = true
    onDone(next)
  }
  return (
    <form
      className="conversation-history-rename"
      onSubmit={event => {
        event.preventDefault()
        finish(ref.current?.value ?? null)
      }}
    >
      <input
        ref={ref}
        aria-label="Conversation name"
        defaultValue={title}
        onBlur={event => finish(event.currentTarget.value)}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault()
            finish(null)
          }
        }}
      />
    </form>
  )
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
  onRename,
}: ConversationHistoryProps) => {
  const [row, setRow] = useState<RowState>({ kind: 'none' })
  const scrollRef = useRef<HTMLDivElement>(null)
  const previousActiveId = useRef(activeId)

  useEffect(() => {
    if (previousActiveId.current !== activeId && scrollRef.current) scrollRef.current.scrollTop = 0
    previousActiveId.current = activeId
  }, [activeId])

  const remove = async (id: ConversationId) => {
    setRow({ kind: 'deleting', id })
    try {
      await onDelete(id)
      setRow({ kind: 'none' })
    } catch (cause) {
      setRow({
        kind: 'failed',
        id,
        message: cause instanceof Error ? cause.message : 'Conversation could not be deleted.',
      })
    }
  }

  const rename = async (conversation: StoredConversation, title: string | null) => {
    const name = title?.trim().replace(/\s+/g, ' ')
    setRow({ kind: 'none' })
    if (!name || name === conversation.title) return
    try {
      await onRename(conversation.id, name)
    } catch (cause) {
      console.error('Unable to rename conversation', cause)
      setRow({ kind: 'failed', id: conversation.id, message: 'Conversation could not be renamed.' })
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
            const title = conversation.title ?? 'New conversation'
            const open = row.kind !== 'none' && row.id === conversation.id
            const renaming = row.kind === 'renaming' && row.id === conversation.id
            const deletePending = row.kind === 'deleting' && row.id === conversation.id
            return (
              <li
                key={conversation.id}
                className={conversation.id === activeId ? 'active' : undefined}
              >
                <div className="conversation-history-row">
                  {renaming ? (
                    <RenameField title={title} onDone={next => void rename(conversation, next)} />
                  ) : (
                    <button
                      type="button"
                      className="conversation-history-main"
                      disabled={switching || deletePending}
                      onClick={() => onSelect(conversation.id)}
                    >
                      <strong>{title}</strong>
                      <time dateTime={new Date(conversation.lastActiveAt).toISOString()}>
                        {activityTime(conversation.lastActiveAt)}
                      </time>
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-button conversation-history-more"
                    aria-label={`More actions for ${title}`}
                    aria-expanded={open && !renaming}
                    disabled={switching || deletePending || renaming}
                    onClick={() =>
                      setRow(current =>
                        current.kind !== 'none' && current.id === conversation.id
                          ? { kind: 'none' }
                          : { kind: 'actions', id: conversation.id },
                      )
                    }
                  >
                    {open && !renaming ? <X size={15} /> : <MoreHorizontal size={16} />}
                  </button>
                </div>
                {open && !renaming && (
                  <div className="conversation-history-actions">
                    <span role={row.kind === 'failed' ? 'alert' : undefined}>
                      {row.kind === 'failed' ? row.message : ''}
                    </span>
                    <button
                      type="button"
                      disabled={deletePending}
                      onClick={() => setRow({ kind: 'renaming', id: conversation.id })}
                    >
                      <Pencil size={13} />
                      Rename
                    </button>
                    <button
                      type="button"
                      className="danger"
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
