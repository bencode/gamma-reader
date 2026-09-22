export type QuotaConfig = {
  databaseFile: string
  dailyTokens: number
  totalDailyTokens: number
  maximumConcurrent: number
  trustProxy: boolean
}

// Token spend is only known once a response completes, so a burst admitted
// together would all pass the daily check before any of them is recorded.
const defaultMaximumConcurrent = 4

const defaultDailyTokens = 200_000

// One network's allowance bounds what a single visitor costs; this bounds what
// everyone together can cost on a day, which is the only figure that stays put
// when the addresses are not the same ones tomorrow.
const defaultTotalDailyTokens = 20_000_000

const tokensFrom = (name: string, raw: string | undefined, fallback: number) => {
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error(`${name} must be a positive integer`)
  return value
}

export const readQuotaConfig = (env: Record<string, string | undefined>): QuotaConfig => ({
  databaseFile: `${env.GAMMA_DATA_DIR?.trim() || 'data'}/gamma-reader.db`,
  dailyTokens: tokensFrom('GAMMA_DAILY_TOKENS', env.GAMMA_DAILY_TOKENS, defaultDailyTokens),
  totalDailyTokens: tokensFrom(
    'GAMMA_TOTAL_DAILY_TOKENS',
    env.GAMMA_TOTAL_DAILY_TOKENS,
    defaultTotalDailyTokens,
  ),
  maximumConcurrent: defaultMaximumConcurrent,
  trustProxy: env.GAMMA_TRUST_PROXY?.trim() === '1',
})
