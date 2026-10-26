import { ChevronRight, CircleAlert, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import {
  type ConversationId,
  conversationNumber,
  type StoredConversation,
} from '../../core/conversations'
import { formatTime } from './conversation-history'
import { keepOrder } from './recent-conversations'
import type { Activity } from './use-conversation'

type SessionListProps = {
  id: string
  conversations: readonly StoredConversation[]
  activeId: ConversationId
  activity: Readonly<Record<ConversationId, Activity>>
  onSelect: (id: ConversationId) => void
  onShowHistory: () => void
}

// The recent conversations under the assistant's title, open until the reader closes it, so one
// can switch back and forth. Rows keep the order they had when the list opened.
export const SessionList = ({
  id,
  conversations,
  activeId,
  activity,
  onSelect,
  onShowHistory,
}: SessionListProps) => {
  const [frozen] = useState(() => conversations.map(conversation => conversation.id))
  return (
    <nav id={id} className="session-list" aria-label="Recent conversations">
      <ul>
        {keepOrder(frozen, conversations).map(conversation => {
          const current = conversation.id === activeId
          const title = conversation.title ?? 'New conversation'
          return (
            <li key={conversation.id}>
              <button
                type="button"
                className={current ? 'session-row active' : 'session-row'}
                aria-current={current ? 'true' : undefined}
                title={title}
                onClick={() => onSelect(conversation.id)}
              >
                <span className="session-status">
                  {activity[conversation.id] === 'running' && (
                    <LoaderCircle className="session-spinner" size={13} aria-label="Answering" />
                  )}
                  {activity[conversation.id] === 'unread' && (
                    <span className="session-unread" role="img" aria-label="New reply" />
                  )}
                  {activity[conversation.id] === 'failed' && (
                    <CircleAlert
                      className="session-failed"
                      size={13}
                      role="img"
                      aria-label="Reply failed"
                    />
                  )}
                </span>
                <span className="session-title">{title}</span>
                <span className="session-number">#{conversationNumber(conversation.id)}</span>
                <time dateTime={new Date(conversation.lastActiveAt).toISOString()}>
                  {formatTime(conversation.lastActiveAt)}
                </time>
              </button>
            </li>
          )
        })}
      </ul>
      <button type="button" className="session-row session-more" onClick={onShowHistory}>
        <span>All history</span>
        <ChevronRight size={14} aria-hidden="true" />
      </button>
    </nav>
  )
}
