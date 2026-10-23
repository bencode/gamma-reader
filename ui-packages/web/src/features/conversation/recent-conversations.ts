import type { ConversationId, StoredConversation } from '../../core/conversations'
import type { Activity } from './use-conversation'

// The quick list: the most recently used conversations, most recent first, and older ones only
// while open or answering. The open conversation is shown as it is in memory, and leads the list
// before it is first saved.
export const recentConversations = (
  items: readonly StoredConversation[],
  active: StoredConversation,
  activity: Readonly<Record<ConversationId, Activity>>,
  limit = 10,
) => {
  const current = items.map(item => (item.id === active.id ? active : item))
  const older = current
    .slice(limit)
    .filter(item => item.id === active.id || activity[item.id] === 'running')
  return [
    ...(items.some(item => item.id === active.id) ? [] : [active]),
    ...current.slice(0, limit),
    ...older,
  ]
}

// While the list stays open its rows keep their places, so switching never moves them under the
// pointer; a conversation new since then goes on top.
export const keepOrder = (
  frozen: readonly ConversationId[],
  conversations: readonly StoredConversation[],
) => {
  const place = new Map(frozen.map((id, index) => [id, index]))
  const known = conversations.filter(item => place.has(item.id))
  return [
    ...conversations.filter(item => !place.has(item.id)),
    ...known.sort((a, b) => (place.get(a.id) ?? 0) - (place.get(b.id) ?? 0)),
  ]
}
