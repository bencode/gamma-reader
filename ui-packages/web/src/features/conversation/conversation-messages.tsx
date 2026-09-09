import { useEffect, useRef } from 'react'
import { Markdown } from '../../components/markdown'
import type { ConversationMessage } from './use-conversation'

export const ConversationMessages = ({
  messages,
  running,
}: {
  messages: ConversationMessage[]
  running: boolean
}) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  useEffect(() => {
    if (!messages.length && !running) return
    const element = scrollRef.current
    if (element && following.current) element.scrollTop = element.scrollHeight
  }, [messages, running])
  return (
    <section
      className="conversation-scroll"
      ref={scrollRef}
      aria-label="Conversation"
      onScroll={event => {
        const element = event.currentTarget
        following.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48
      }}
    >
      {messages.length === 0 && (
        <p className="conversation-notice">
          Messages and document excerpts used in chat are sent to the AI provider.
        </p>
      )}
      {messages.map(message => (
        <article
          key={message.id}
          className={message.text ? 'conversation-message' : 'conversation-message tool-message'}
          aria-label={message.role === 'user' ? 'You' : 'Assistant'}
        >
          {message.text && <h3>{message.role === 'user' ? 'You' : 'Assistant'}</h3>}
          {message.role === 'user' ? (
            <p className="user-message">{message.text}</p>
          ) : (
            <Markdown text={message.text} variant="chat" />
          )}
          {message.tools.length > 0 && (
            <ul className="tool-activity" aria-label="Tool activity">
              {message.tools.map(tool => (
                <li key={tool.id}>
                  <span>{tool.name}</span>
                  <span>{tool.status}</span>
                </li>
              ))}
            </ul>
          )}
          {message.notice && (
            <p className="conversation-notice" role={message.failed ? 'alert' : 'status'}>
              {message.notice}
            </p>
          )}
        </article>
      ))}
      {running && (
        <p className="conversation-notice" role="status">
          Working…
        </p>
      )}
    </section>
  )
}
