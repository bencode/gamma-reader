/**
 * Why an endpoint could not be used. `blocked` and `unreachable` both surface
 * as a bare `TypeError` from `fetch` — no status, no body, indistinguishable
 * from each other and from being offline — so they are told apart deliberately
 * below. Getting that wrong leaves a reader staring at an endpoint that looks
 * broken for no stated reason.
 */
export type DiscoveryFailure = 'key' | 'endpoint' | 'blocked' | 'unreachable' | 'unknown'

export type Discovery = { ok: true; models: string[] } | { ok: false; reason: DiscoveryFailure }

const modelsUrl = (baseUrl: string) => `${baseUrl.replace(/\/+$/, '')}/models`

const modelIds = (payload: unknown) => {
  if (typeof payload !== 'object' || payload === null || !('data' in payload)) return []
  const { data } = payload
  if (!Array.isArray(data)) return []
  return data.flatMap(entry =>
    typeof entry === 'object' && entry !== null && 'id' in entry && typeof entry.id === 'string'
      ? [entry.id]
      : [],
  )
}

/**
 * A request the browser will send to any reachable host, since it carries only
 * safelisted headers and the reply is never read. It answers the one question
 * the failed request cannot: is anything listening there at all?
 */
const reachable = async (baseUrl: string, signal?: AbortSignal) => {
  try {
    await fetch(modelsUrl(baseUrl), { mode: 'no-cors', signal })
    return true
  } catch {
    return false
  }
}

/**
 * Lists the models an endpoint offers, which doubles as the check that the key
 * works — a reader should learn a key is wrong while typing it, not midway
 * through an answer.
 */
export const listModels = async (
  baseUrl: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<Discovery> => {
  let response: Response
  try {
    response = await fetch(modelsUrl(baseUrl), {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    })
  } catch (cause) {
    if (signal?.aborted) throw cause
    if (!(cause instanceof TypeError)) throw cause
    return { ok: false, reason: (await reachable(baseUrl, signal)) ? 'blocked' : 'unreachable' }
  }
  if (response.status === 401 || response.status === 403) return { ok: false, reason: 'key' }
  if (response.status === 404) return { ok: false, reason: 'endpoint' }
  if (!response.ok) return { ok: false, reason: 'unknown' }
  const payload: unknown = await response.json().catch((cause: unknown) => {
    // A reply that is not JSON at all is an address that is not this API: a
    // website answering 200, most often a base URL that lost its /v1.
    if (cause instanceof SyntaxError) return undefined
    throw cause
  })
  const models = modelIds(payload)
  return models.length > 0 ? { ok: true, models } : { ok: false, reason: 'endpoint' }
}
