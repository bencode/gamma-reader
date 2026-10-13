import type { AgentMessage } from '@earendil-works/pi-agent-core'
import { contentText, type Message, type Usage, type UserMessage } from '@earendil-works/pi-ai'
import { estimateContextTokens, estimateMessageTokens } from '@earendil-works/pi-ai/utils/estimate'

// Context compaction, after pi's coding agent (packages/coding-agent/src/core/compaction). A
// compaction is appended to the conversation and never rewrites it: the provider is sent the
// summary in place of the messages before firstKept, while the reader still sees them all.

export type CompactionMessage = {
  role: 'compaction'
  summary: string
  /** Position of the first message kept as it is, counting conversation messages only (no system
   *  messages), which is the position it is stored at. */
  firstKept: number
  tokensBefore: number
  /** The calls that wrote the summary. */
  usages: Usage[]
  timestamp: number
}

declare module '@earendil-works/pi-agent-core' {
  interface CustomAgentMessages {
    compaction: CompactionMessage
  }
}

export const isCompactionMessage = (message: AgentMessage): message is CompactionMessage =>
  message.role === 'compaction'

export const compactionSettings = {
  /** Room left for the reply; it also bounds the summary's length. */
  reserveTokens: 16_384,
  /** Recent context kept as it is. */
  keepRecentTokens: 20_000,
}

const summaryPrefix =
  'The conversation history before this point was compacted into the following summary:\n\n<summary>\n'
const summarySuffix = '\n</summary>'

const summaryMessage = ({ summary, timestamp }: CompactionMessage): UserMessage => ({
  role: 'user',
  content: [{ type: 'text', text: `${summaryPrefix}${summary}${summarySuffix}` }],
  // Later than every message it replaces, so usage reported before it no longer anchors estimates.
  timestamp,
})

type Item = { position: number | null; message: AgentMessage }

// System messages are not stored and declare tool changes mid-transcript, so they are never
// summarized away and do not count towards positions.
const positioned = (messages: readonly AgentMessage[]): Item[] => {
  let next = 0
  return messages.map(message =>
    message.role === 'system' ? { position: null, message } : { position: next++, message },
  )
}

// What the model sees after the latest compaction: its summary, the messages it kept and every
// message since. Older compactions inside the kept range contribute nothing.
const projectEntries = (messages: readonly AgentMessage[]) => {
  const items = positioned(messages)
  const latest = items.findLast(item => isCompactionMessage(item.message))
  if (!latest || !isCompactionMessage(latest.message) || latest.position === null)
    return { previousSummary: undefined, items }
  const { firstKept, summary } = latest.message
  const kept = items.filter(
    ({ position, message }) =>
      position === null ||
      (position >= firstKept && position !== latest.position && !isCompactionMessage(message)),
  )
  const at = kept.findIndex(item => item.position !== null)
  const replacement = { position: null, message: summaryMessage(latest.message) }
  return {
    previousSummary: summary,
    items: at < 0 ? [...kept, replacement] : [...kept.slice(0, at), replacement, ...kept.slice(at)],
  }
}

export const projectContext = (messages: readonly AgentMessage[]): Message[] =>
  projectEntries(messages).items.flatMap(({ message }) =>
    isCompactionMessage(message) ? [] : [message],
  )

export type CompactionPlan = {
  firstKept: number
  /** Messages folded into the summary. */
  history: Message[]
  /** When the cut falls inside a turn, the start of that turn, summarized on its own. */
  turnPrefix: Message[]
  previousSummary?: string
  tokensBefore: number
}

// A tool result must follow its call, so a cut never lands on one.
const isCutPoint = (message: AgentMessage) =>
  message.role === 'user' || message.role === 'assistant'

// Walks back from the newest message until keepRecentTokens is reached and cuts at the nearest
// valid point at or after it. Returns null when there is nothing to fold away.
export const planCompaction = (
  conversation: readonly AgentMessage[],
  keepRecentTokens = compactionSettings.keepRecentTokens,
): CompactionPlan | null => {
  const last = conversation.at(-1)
  if (!last || isCompactionMessage(last)) return null
  const { previousSummary, items } = projectEntries(conversation)
  const entries = items.filter(
    (item): item is { position: number; message: Message } =>
      item.position !== null && !isCompactionMessage(item.message),
  )
  const cutPoints = entries.flatMap((entry, index) => (isCutPoint(entry.message) ? [index] : []))
  const first = cutPoints[0]
  if (first === undefined) return null
  // suffix[i]: tokens from entry i to the newest.
  const suffix = entries.reduceRight<number[]>((sums, entry, index) => {
    sums[index] = (sums[index + 1] ?? 0) + estimateMessageTokens(entry.message)
    return sums
  }, [])
  const reached = suffix.findLastIndex(tokens => tokens >= keepRecentTokens)
  // When trailing tool results alone pass the budget, keep the call they answer.
  const cut =
    reached < 0 ? first : (cutPoints.find(index => index >= reached) ?? cutPoints.at(-1) ?? first)
  const startsTurn = entries[cut]?.message.role === 'user'
  const turnStart = startsTurn
    ? -1
    : entries.findLastIndex((entry, index) => index <= cut && entry.message.role === 'user')
  const split = !startsTurn && turnStart >= 0
  const history = entries.slice(0, split ? turnStart : cut).map(entry => entry.message)
  const turnPrefix = split ? entries.slice(turnStart, cut).map(entry => entry.message) : []
  const firstKept = entries[cut]?.position
  if (firstKept === undefined || (!history.length && !turnPrefix.length)) return null
  return {
    firstKept,
    history,
    turnPrefix,
    previousSummary,
    tokensBefore: estimateContextTokens(projectContext(conversation)).tokens,
  }
}

const toolResultLimit = 2_000

const truncate = (text: string) =>
  text.length <= toolResultLimit
    ? text
    : `${text.slice(0, toolResultLimit)}\n\n[... ${text.length - toolResultLimit} more characters truncated]`

// Written as text so the summarizing model reads it rather than continuing it. Thinking is left
// out: replayed reasoning can make the request larger than the context it summarizes, and the
// text, tool calls and results already record what happened.
export const serializeConversation = (messages: readonly Message[]) =>
  messages
    .flatMap(message => {
      if (message.role === 'user') {
        const text = contentText(message.content, '')
        return text ? [`[User]: ${text}`] : []
      }
      if (message.role === 'toolResult') {
        const text = contentText(message.content, '')
        return text ? [`[Tool result]: ${truncate(text)}`] : []
      }
      if (message.role !== 'assistant') return []
      const calls = message.content.flatMap(block =>
        block.type === 'toolCall'
          ? [
              `${block.name}(${Object.entries(block.arguments)
                .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
                .join(', ')})`,
            ]
          : [],
      )
      return [
        ...(message.content.some(block => block.type === 'text')
          ? [`[Assistant]: ${contentText(message.content)}`]
          : []),
        ...(calls.length ? [`[Assistant tool calls]: ${calls.join('; ')}`] : []),
      ]
    })
    .join('\n\n')
