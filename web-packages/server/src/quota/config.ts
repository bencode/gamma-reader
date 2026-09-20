export type QuotaConfig = {
  databaseFile: string
  dailyTokens: number
  maximumConcurrent: number
  trustProxy: boolean
}

// Token spend is only known once a response completes, so a burst admitted
// together would all pass the daily check before any of them is recorded.
const defaultMaximumConcurrent = 4

const defaultDailyTokens = 1_000_000

const dailyTokensFrom = (raw: string | undefined) => {
  if (raw === undefined || raw.trim() === '') return defaultDailyTokens
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error('GAMMA_DAILY_TOKENS must be a positive integer')
  return value
}

export const readQuotaConfig = (env: Record<string, string | undefined>): QuotaConfig => ({
  databaseFile: `${env.GAMMA_DATA_DIR?.trim() || 'data'}/gamma-reader.db`,
  dailyTokens: dailyTokensFrom(env.GAMMA_DAILY_TOKENS),
  maximumConcurrent: defaultMaximumConcurrent,
  trustProxy: env.GAMMA_TRUST_PROXY?.trim() === '1',
})
