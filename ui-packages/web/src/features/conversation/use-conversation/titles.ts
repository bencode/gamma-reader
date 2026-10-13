import type { Agent } from '@earendil-works/pi-agent-core'
import type { ConversationId, TitleSource } from '../../../core/conversations'
import { renameStoredConversation } from '../../../data/conversation-store'
import { generateConversationTitle } from '../../assistant/conversation-title'
import { queueDraft } from './drafts'
import { update } from './history'
import { type Ctx, getActive, setActive } from './state'

// The active conversation is written whole from memory, so its title changes there; any other
// is changed in storage. A title the reader chose is never replaced by one the model suggests.
export const applyTitle = async (
  ctx: Ctx,
  id: ConversationId,
  title: string,
  titledBy: TitleSource,
) => {
  const current = getActive(ctx)
  if (current.id !== id) {
    const renamed = await renameStoredConversation(id, title, titledBy)
    update(ctx, renamed)
    return
  }
  if (titledBy === 'model' && current.titledBy === 'reader') return
  const next = { ...current, title, titledBy }
  setActive(ctx, next)
  await queueDraft(ctx, next, true)
}

// A title cut from the first message is often "summarize this"; once a reply has finished, the
// model names the conversation from the exchange. A failure keeps the cut title and is tried
// again after the next reply.
export const nameConversation = (
  ctx: Ctx,
  agent: Agent,
  id: ConversationId,
  question: { text: string; attachments: readonly { name: string }[] },
) => {
  const active = getActive(ctx)
  if (active.id !== id || active.titledBy) return
  const reply = agent.state.messages.at(-1)
  if (reply?.role !== 'assistant' || reply.stopReason !== 'stop') return
  const answer = reply.content.flatMap(block => (block.type === 'text' ? [block.text] : []))
  generateConversationTitle(agent.state.model, {
    question: question.text || question.attachments.map(item => item.name).join(', '),
    answer: answer.join(''),
  })
    .then(title => applyTitle(ctx, id, title, 'model'))
    .catch(cause => console.error('Unable to name the conversation', cause))
}
