import { ArrowUp, MessageSquare, Quote as QuoteIcon, X } from 'lucide-react'
import type { RefObject } from 'react'
import type { Workspace } from '../../shell/use-workspace'

type ConversationPanelProps = {
  workspace: Workspace
  inputRef: RefObject<HTMLTextAreaElement | null>
  onClose: () => void
}

export const ConversationPanel = ({ workspace, inputRef, onClose }: ConversationPanelProps) => (
  <aside className="conversation-panel panel-surface" aria-label="Reading assistant">
    <header className="panel-header">
      <h2>
        <MessageSquare size={16} /> <span>Reading assistant</span>
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
    <div className="conversation-scroll" />
    <div className="composer-area">
      {workspace.quotes.length > 0 && (
        <section className="quote-list" aria-label="Selected excerpts">
          <div className="quote-list-label">
            <QuoteIcon size={13} /> {workspace.quotes.length}{' '}
            {workspace.quotes.length === 1 ? 'excerpt' : 'excerpts'}
          </div>
          {workspace.quotes.map(quote => (
            <div className="quote-item" key={quote.id}>
              <div>
                <span className="quote-source">{quote.source}</span>
                <blockquote>{quote.text}</blockquote>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove excerpt from ${quote.source}`}
                onClick={() => workspace.removeQuote(quote.id)}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </section>
      )}
      <div className="composer">
        <textarea
          ref={inputRef}
          aria-label="Your question"
          placeholder="What would you like to understand?"
          value={workspace.draft}
          onChange={event => workspace.setDraft(event.target.value)}
          rows={3}
        />
        <div className="composer-bottom">
          <button
            type="button"
            className="send-button"
            aria-label="Send question"
            disabled
            title="AI is not connected yet"
          >
            <ArrowUp size={17} />
          </button>
        </div>
      </div>
    </div>
  </aside>
)
