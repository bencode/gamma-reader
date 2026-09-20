import type { ImageContent } from '@earendil-works/pi-ai'

export const maximumVisionImageBytes = 8 * 1024 * 1024
export const maximumVisionImageSide = 4096

// Measured against the vision model: Chinese body text is read reliably at this
// size and falls off a cliff below roughly a megapixel, while the provider
// charges by the pixel until a ceiling far above anything reading needs.
export const readerImagePixels = 1_500_000

// A scanned page is the hardest thing the vision model is asked to read, so it
// keeps whatever the page renderer already decided to produce.
export const documentPagePixels = 4_000_000

const directMediaTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

// Sources that may carry transparency. Flattening those onto white turns light
// text on a transparent background into nothing, so they are re-encoded as PNG.
const alphaMediaTypes = new Set(['image/png', 'image/webp', 'image/svg+xml'])

/**
 * How far an image of this size must shrink to fit the given budget. Shared
 * with the PDF page renderer so a page and an upload cannot end up bounded by
 * two copies of the same numbers.
 */
export const fitScale = (width: number, height: number, maximumPixels: number) =>
  Math.min(
    1,
    maximumVisionImageSide / width,
    maximumVisionImageSide / height,
    Math.sqrt(maximumPixels / (width * height)),
  )

const encodeBase64 = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const chunks: string[] = []
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)))
  return btoa(chunks.join(''))
}

const encodeCanvas = (canvas: HTMLCanvasElement, mimeType: string) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Unable to encode this image.'))),
      mimeType,
      0.9,
    )
  })

const rasterize = async (
  bitmap: ImageBitmap,
  initialScale: number,
  sourceType: string,
  signal?: AbortSignal,
) => {
  const transparent = alphaMediaTypes.has(sourceType)
  const mimeType = transparent ? 'image/png' : 'image/jpeg'
  let scale = initialScale
  while (true) {
    signal?.throwIfAborted()
    // Rounded down, so the budget is a ceiling rather than a target.
    const width = Math.max(1, Math.floor(bitmap.width * scale))
    const height = Math.max(1, Math.floor(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Image conversion is unavailable in this browser.')
    if (!transparent) {
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, width, height)
    }
    context.drawImage(bitmap, 0, 0, width, height)
    const blob = await encodeCanvas(canvas, mimeType)
    signal?.throwIfAborted()
    if (blob.size <= maximumVisionImageBytes) return { blob, width, height, mimeType }
    if (width === 1 && height === 1)
      throw new Error('This image cannot be reduced to the vision input limit.')
    scale *= Math.min(0.9, Math.sqrt(maximumVisionImageBytes / blob.size) * 0.9)
  }
}

export type PreparedImage = ImageContent & { width: number; height: number }

export const prepareImage = async (
  blob: Blob,
  mediaType: string,
  maximumPixels: number,
  signal?: AbortSignal,
): Promise<PreparedImage> => {
  signal?.throwIfAborted()
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch (cause) {
    signal?.throwIfAborted()
    throw new Error('This image could not be decoded in the browser.', { cause })
  }
  try {
    signal?.throwIfAborted()
    const scale = fitScale(bitmap.width, bitmap.height, maximumPixels)
    if (directMediaTypes.has(mediaType) && blob.size <= maximumVisionImageBytes && scale === 1) {
      const data = await encodeBase64(blob)
      signal?.throwIfAborted()
      return {
        type: 'image',
        data,
        mimeType: mediaType,
        width: bitmap.width,
        height: bitmap.height,
      }
    }
    const converted = await rasterize(bitmap, scale, mediaType, signal)
    const data = await encodeBase64(converted.blob)
    signal?.throwIfAborted()
    return {
      type: 'image',
      data,
      mimeType: converted.mimeType,
      width: converted.width,
      height: converted.height,
    }
  } finally {
    bitmap.close()
  }
}
