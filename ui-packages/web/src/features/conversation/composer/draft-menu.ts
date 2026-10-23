import {
  type ConversationId,
  conversationNumber,
  type StoredConversation,
} from '../../../core/conversations'
import type { FileReference } from '../../../core/reader-message'
import {
  conversationMentionAt,
  conversationOption,
  rankConversations,
} from './conversation-mentions'
import { fileOption, rankMentions } from './file-mentions'
import { type Mention, type MentionOption, mentionAt } from './mentions'
import { matchCommands, type SlashCommand } from './slash-command-menu'

// What the draft asks for: a command typed into an empty draft, or the @ or # the caret ends.
export type MenuQuery =
  | { kind: 'command'; input: string }
  | { kind: 'file' | 'conversation'; mention: Mention }

// The list the draft shows. A mention's tokens are what picking each option writes.
export type ComposerMenu =
  | { kind: 'command'; commands: SlashCommand[] }
  | {
      kind: 'mention'
      label: 'Files' | 'Conversations'
      mention: Mention
      options: MentionOption[]
      tokens: string[]
    }

type MenuSources = {
  commands: readonly SlashCommand[]
  files: readonly FileReference[]
  recentFileIds: readonly string[]
  conversations: readonly StoredConversation[]
  activeConversationId: ConversationId
}

// The caret is null when it was not read in this draft. An @ and a # never end at one caret.
export const menuQuery = (
  command: string,
  draft: string,
  caret: number | null,
): MenuQuery | null => {
  if (command) return { kind: 'command', input: command }
  if (caret === null) return null
  const file = mentionAt('@', draft, caret)
  if (file) return { kind: 'file', mention: file }
  const conversation = conversationMentionAt(draft, caret)
  return conversation ? { kind: 'conversation', mention: conversation } : null
}

// Null when nothing matches, so an empty list never opens.
export const composerMenu = (
  query: MenuQuery | null,
  sources: MenuSources,
): ComposerMenu | null => {
  if (!query) return null
  if (query.kind === 'command') {
    const commands = matchCommands(query.input, sources.commands)
    return commands.length ? { kind: 'command', commands } : null
  }
  if (query.kind === 'file') {
    const files = rankMentions(sources.files, query.mention.query, sources.recentFileIds)
    return files.length
      ? {
          kind: 'mention',
          label: 'Files',
          mention: query.mention,
          options: files.map(fileOption),
          tokens: files.map(file => `@${file.path}`),
        }
      : null
  }
  const conversations = rankConversations(
    sources.conversations,
    query.mention.query,
    sources.activeConversationId,
  )
  return conversations.length
    ? {
        kind: 'mention',
        label: 'Conversations',
        mention: query.mention,
        options: conversations.map(conversationOption),
        tokens: conversations.map(conversation => `#${conversationNumber(conversation.id)}`),
      }
    : null
}
