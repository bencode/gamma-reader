import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Markdown } from '../../components/markdown'
import { MessageAttachments } from './conversation-attachments'
import type { ConversationMessage } from './use-conversation'

const toolLabel = (name: string) => {
  if (name === 'get_reader_state') return 'Checking reading context'
  if (name === 'list') return 'Looking through files'
  if (name === 'search') return 'Searching files'
  if (name === 'read') return 'Reading document'
  if (name === 'analyze_image') return 'Analyzing image'
  if (name === 'write') return 'Writing file'
  return name
}

const CopyAnswer = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="icon-button copy-answer"
      aria-label={copied ? 'Answer copied' : 'Copy answer'}
      title={copied ? 'Copied' : 'Copy answer'}
      onClick={() => {
        const clipboard = navigator.clipboard
        if (!clipboard) {
          console.error('Clipboard access is unavailable in this browser.')
          return
        }
        void clipboard
          .writeText(text)
          .then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
          })
          .catch(error => console.error('Unable to copy assistant answer', error))
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  )
}

export const ConversationMessages = ({
  messages,
  running,
  onOpenFile,
  availableFileIds,
}: {
  messages: ConversationMessage[]
  running: boolean
  onOpenFile: (id: string) => void
  availableFileIds: ReadonlySet<string>
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
      {messages.map((message, index) => {
        const answered = messages
          .slice(index + 1)
          .some(candidate => candidate.role === 'assistant' && Boolean(candidate.text))
        const tools =
          message.text || answered
            ? message.tools.filter(tool => tool.status !== 'Completed')
            : message.tools
        const hasBody = Boolean(message.text || message.attachments.length)
        return (
          <article
            key={message.id}
            className={`${hasBody ? 'conversation-message' : 'conversation-message tool-message'} ${message.role}`}
            aria-label={message.role === 'user' ? 'You' : 'Assistant'}
          >
            {hasBody && <h3>{message.role === 'user' ? 'You' : 'Assistant'}</h3>}
            {message.role === 'user' ? (
              <>
                {message.text && <p className="user-message">{message.text}</p>}
                <MessageAttachments
                  attachments={message.attachments}
                  onOpen={onOpenFile}
                  availableFileIds={availableFileIds}
                />
              </>
            ) : (
              <>
                <Markdown text={message.text} variant="chat" />
                {message.copyable && message.text && <CopyAnswer text={message.text} />}
              </>
            )}
            {tools.length > 0 && (
              <ul className="tool-activity" aria-label="Tool activity">
                {tools.map(tool => (
                  <li key={tool.id}>
                    <span>{toolLabel(tool.name)}</span>
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
        )
      })}
      {running && (
        <p className="conversation-notice" role="status">
          Working…
        </p>
      )}
    </section>
  )
}
