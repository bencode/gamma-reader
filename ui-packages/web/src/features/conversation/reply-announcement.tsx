import { useState } from 'react'
import type { ConversationId } from '../../core/conversations'
import type { ConversationPhase } from './use-conversation'

// The streamed answer is no live region, since it would be read out token by token, and the
// "Working…" status only disappears, which says nothing. So a reply that ends in the open
// conversation is announced here. A failed one speaks through its own alert, a stopped one was
// the reader's doing, and switching away from a running conversation finishes nothing.
export const ReplyAnnouncement = ({
  conversationId,
  phase,
  whole,
}: {
  conversationId: ConversationId
  phase: ConversationPhase
  // The last reply stopped by itself or at its limit: the answer Copy offers.
  whole: boolean
}) => {
  const running = phase === 'running' || phase === 'stopping'
  const [seen, setSeen] = useState({ conversationId, running })
  const [announcement, setAnnouncement] = useState('')
  if (seen.conversationId !== conversationId || seen.running !== running) {
    setSeen({ conversationId, running })
    const finished = seen.conversationId === conversationId && seen.running && phase === 'ready'
    setAnnouncement(finished && whole ? 'Reply finished.' : '')
  }
  return (
    <p className="visually-hidden" role="status" aria-live="polite">
      {announcement}
    </p>
  )
}
