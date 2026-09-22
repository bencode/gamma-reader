import { dataUrlExtent } from './image.js'

// The largest picture the proxy forwards. It matches the budget the reader
// already renders to, so it never turns away a genuine client; what it stops is
// a caller that skips the reader and asks for forty megapixels at once.
export const maximumImagePixels = 4_000_000

// The provider prices an image by its pixels — about 1,300 per megapixel, with
// no ceiling, measured across four resolutions. Rounded up, because the
// estimate worth avoiding is the one that runs low.
const tokensPerMegapixel = 1_500

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

export type RequestImages = { bytes: number; pixels: number }

/**
 * What the pictures in a request weigh and cover. A header this cannot read is
 * counted as a whole budget, so an unrecognised format is the expensive way in
 * rather than the cheap one.
 */
export const requestImages = (body: Record<string, unknown>): RequestImages => {
  const urls = dataUrls(body)
  return {
    bytes: urls.reduce((total, url) => total + Buffer.byteLength(url), 0),
    pixels: urls.reduce((total, url) => {
      const extent = dataUrlExtent(url)
      return total + (extent ? extent.width * extent.height : maximumImagePixels)
    }, 0),
  }
}

/**
 * What to charge a request the provider never reported a total for, which
 * happens when the reader stops an answer the model has already processed.
 * Base64 image data is what makes a body large without making it expensive, so
 * it is priced by the pixels it carries while everything else is priced by
 * size, and the output the caller asked for is added on top.
 */
export const fallbackTokens = (
  body: Record<string, unknown>,
  payloadBytes: number,
  images: RequestImages,
) => {
  const text = Math.max(0, payloadBytes - images.bytes)
  const output = typeof body.max_tokens === 'number' ? body.max_tokens : 0
  return Math.ceil(text / 4) + Math.ceil((images.pixels * tokensPerMegapixel) / 1_000_000) + output
}
