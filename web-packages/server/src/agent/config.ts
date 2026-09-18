import type { AgentConfig } from './contract.js'

export type AgentServerConfig = { apiKey: string; modelId: string; visionModelId: string }

export type GuardConfig = {
  /** Allow localhost origins regardless of the Host header (development). */
  allowLocalhost: boolean
  /** Origins (scheme://host[:port]) accepted in addition to same-host requests. */
  extraOrigins: string[]
  /** Enable the per-IP and global token budgets. */
  rateLimiting: boolean
  /** Requests allowed per client address per minute. */
  perMinute: number
  /** Estimated tokens allowed per client address per day. */
  dailyTokensPerIp: number
  /** Estimated tokens allowed across all clients per day. */
  dailyGlobalTokens: number
  /** Hard cap for the max_tokens field sent upstream. */
  maxOutputTokens: number
  /** Hard cap in bytes for one streamed model response. */
  maxStreamBytes: number
  /** Trust X-Forwarded-For from a reverse proxy you control. */
  trustProxy: boolean
}

export const readAgentConfig = (env: Record<string, string | undefined>): AgentServerConfig => ({
  apiKey: env.GLM_API_KEY?.trim() ?? '',
  modelId: env.GLM_MODEL?.trim() || 'glm-5.3',
  visionModelId: env.GLM_VISION_MODEL?.trim() || 'glm-5.3-flash',
})

const positiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value?.trim())
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

export const readGuardConfig = (env: Record<string, string | undefined>): GuardConfig => ({
  allowLocalhost: env.NODE_ENV !== 'production',
  extraOrigins: (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean),
  rateLimiting: env.RATE_LIMIT?.trim() !== '0',
  perMinute: positiveInt(env.RATE_LIMIT_PER_MINUTE, 20),
  dailyTokensPerIp: positiveInt(env.RATE_LIMIT_DAILY_TOKENS_PER_IP, 2_000_000),
  dailyGlobalTokens: positiveInt(env.RATE_LIMIT_DAILY_GLOBAL_TOKENS, 40_000_000),
  maxOutputTokens: positiveInt(env.MAX_OUTPUT_TOKENS, 16_384),
  maxStreamBytes: positiveInt(env.MAX_STREAM_BYTES, 8 * 1024 * 1024),
  trustProxy: env.TRUST_PROXY?.trim() === '1',
})

export const publicAgentConfig = ({
  apiKey,
  modelId,
  visionModelId,
}: AgentServerConfig): AgentConfig =>
  apiKey ? { enabled: true, provider: 'zai-coding-cn', modelId, visionModelId } : { enabled: false }
