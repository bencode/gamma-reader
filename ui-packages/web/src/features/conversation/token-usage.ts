import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { Usage } from '@earendil-works/pi-ai'
import { calculateContextTokens, estimateContextTokens } from '@earendil-works/pi-ai/utils/estimate'

export type TokenUsage = {
  /** Tokens the next request will carry, anchored on the last reported usage. */
  context: number
  /** Every model call in the conversation, including tools that call a model themselves. */
  used: number
  input: number
  output: number
}

/** A window is shown only when the selected model's catalog states one. */
export type ConversationTokenUsage = TokenUsage & { contextWindow?: number }

const reported = (message: AgentMessage): Usage[] =>
  (message.role === 'assistant' || message.role === 'toolResult') && message.usage
    ? [message.usage]
    : []

export const tokenUsage = (messages: readonly AgentMessage[]): TokenUsage | null => {
  const usages = messages.flatMap(reported).filter(usage => calculateContextTokens(usage) > 0)
  if (!usages.length) return null
  return {
    context: estimateContextTokens(messages).tokens,
    used: usages.reduce((total, usage) => total + calculateContextTokens(usage), 0),
    input: usages.reduce(
      (total, usage) => total + usage.input + usage.cacheRead + usage.cacheWrite,
      0,
    ),
    output: usages.reduce((total, usage) => total + usage.output, 0),
  }
}
