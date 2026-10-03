// A deployment can bind its library to a remote source, which the reader keeps in sync. The source
// is any address serving the listing the reader asks for; this server only says where it is.
export type SourceConfig = { name: string; url: string }

export const readSourceConfig = (env: Record<string, string | undefined>): SourceConfig | null => {
  const url = env.GAMMA_SOURCE_URL?.trim()
  const name = env.GAMMA_SOURCE_NAME?.trim()
  if (!url && !name) return null
  if (!url || !name) throw new Error('GAMMA_SOURCE_URL and GAMMA_SOURCE_NAME must be set together')
  return { name, url }
}
