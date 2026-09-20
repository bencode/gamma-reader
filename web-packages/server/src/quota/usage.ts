// Providers may split a single SSE line across chunks. Beyond this much buffered
// text the response is not a usage-bearing event stream, so stop looking.
const maximumPendingChars = 1024 * 1024

const totalTokens = (chunk: unknown) => {
  if (typeof chunk !== 'object' || chunk === null || !('usage' in chunk)) return null
  const { usage } = chunk
  if (typeof usage !== 'object' || usage === null || !('total_tokens' in usage)) return null
  const { total_tokens: total } = usage
  return typeof total === 'number' && Number.isFinite(total) && total >= 0 ? total : null
}

const lineTotal = (line: string) => {
  if (!line.startsWith('data:')) return null
  const payload = line.slice('data:'.length).trim()
  if (!payload.includes('"usage"')) return null
  try {
    return totalTokens(JSON.parse(payload))
  } catch (cause) {
    if (!(cause instanceof SyntaxError)) throw cause
    return null
  }
}

/**
 * Forwards an event stream untouched while reading the token usage the provider
 * reports on its final chunk. `settle` runs once the stream finishes, is
 * cancelled by the client, or fails, with `null` when no usage was observed.
 */
export const createUsageSniffer = (settle: (total: number | null) => void) => {
  const decoder = new TextDecoder()
  let pending = ''
  let abandoned = false
  let total: number | null = null

  const observe = (line: string) => {
    const seen = lineTotal(line)
    if (seen !== null) total = seen
  }

  const consume = (text: string) => {
    if (abandoned) return
    pending += text
    for (let end = pending.indexOf('\n'); end !== -1; end = pending.indexOf('\n')) {
      observe(pending.slice(0, end))
      pending = pending.slice(end + 1)
    }
    if (pending.length > maximumPendingChars) {
      abandoned = true
      pending = ''
      total = null
    }
  }

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk)
      consume(decoder.decode(chunk, { stream: true }))
    },
    flush() {
      consume(decoder.decode())
      if (!abandoned) observe(pending)
      settle(total)
    },
    cancel() {
      settle(null)
    },
  })
}
