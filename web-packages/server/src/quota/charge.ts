// What one image costs at the largest budget any caller sends — a rendered
// document page, measured at 5,626 input tokens for four megapixels.
const imageAnalysisTokens = 6_000

const dataUrls = (body: Record<string, unknown>) => {
  const found: string[] = []
  const walk = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(walk)
    if (typeof value !== 'object' || value === null) return
    for (const entry of Object.values(value)) {
      if (typeof entry === 'string') {
        if (entry.startsWith('data:')) found.push(entry)
      } else walk(entry)
    }
  }
  walk(body.messages)
  return found
}

/**
 * What to charge a request the provider never reported a total for, which
 * happens when the reader stops an answer the model has already processed.
 * Base64 image data is what makes a body large without making it expensive, so
 * it is priced per image while everything else is priced by size, and the
 * output the caller asked for is added on top. Deriving all three from the
 * request keeps this off a hand-tuned constant, which has been wrong before.
 */
export const fallbackTokens = (body: Record<string, unknown>, payloadBytes: number) => {
  const images = dataUrls(body)
  const imageBytes = images.reduce((total, url) => total + Buffer.byteLength(url), 0)
  const text = Math.max(0, payloadBytes - imageBytes)
  const output = typeof body.max_tokens === 'number' ? body.max_tokens : 0
  return Math.ceil(text / 4) + images.length * imageAnalysisTokens + output
}
