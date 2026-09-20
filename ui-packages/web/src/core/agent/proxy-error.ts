// The model SDK cannot fold a proxy error body into its message, so a refusal
// from our own proxy arrives as `429: {"message":"…"}`. Recover the sentence.
const proxyFailure = /^\d{3}: (\{.*\})$/s

export const readableProxyError = (message: string | undefined) => {
  const body = message === undefined ? undefined : proxyFailure.exec(message)?.[1]
  if (body === undefined) return message
  try {
    const parsed: unknown = JSON.parse(body)
    if (typeof parsed !== 'object' || parsed === null || !('message' in parsed)) return message
    return typeof parsed.message === 'string' && parsed.message ? parsed.message : message
  } catch (cause) {
    if (!(cause instanceof SyntaxError)) throw cause
    return message
  }
}
