import type { PublicModelConfig } from '@gamma-reader/shared/model-config'

export const loadModelConfig = async (signal: AbortSignal): Promise<PublicModelConfig> => {
  const response = await fetch('/api/agent/config', { signal, cache: 'no-store' })
  if (!response.ok) throw new Error('Could not connect to chat. Reload to try again.')
  return response.json()
}
