import { ArrowUp, MessageSquare, Square, X } from 'lucide-react'
import type { RefObject } from 'react'
import { useReaderConversation } from './conversation-context'
import { ConversationMessages } from './conversation-messages'

export const ConversationPanel = ({
  inputRef,
  onClose,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>
  onClose: () => void
}) => {
  const { draft, setDraft, messages, phase, error, send, stop } = useReaderConversation()
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
      <ConversationMessages messages={messages} running={running} />
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
        <div className="composer">
          <textarea
            ref={inputRef}
            aria-label="Your question"
            placeholder="What would you like to understand?"
            value={draft}
            onChange={event => setDraft(event.target.value)}
            rows={3}
            onKeyDown={event => {
              if (
                event.key !== 'Enter' ||
                event.shiftKey ||
                event.nativeEvent.isComposing ||
                event.keyCode === 229
              )
                return
              event.preventDefault()
              if (phase === 'ready') void send()
            }}
          />
          <div className="composer-bottom">
            <button
              type="button"
              className="send-button"
              aria-label={running ? 'Stop generation' : 'Send question'}
              title={running ? 'Stop generation' : 'Send question'}
              disabled={phase === 'stopping' || (!running && (phase !== 'ready' || !draft.trim()))}
              onClick={() => {
                if (running) stop()
                else void send()
              }}
            >
              {running ? <Square size={13} /> : <ArrowUp size={17} />}
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}
