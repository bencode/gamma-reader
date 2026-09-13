import type { ImageContent } from '@earendil-works/pi-ai'
import { LocalToolError } from './local-tool-types'

export const maximumVisionImageBytes = 8 * 1024 * 1024
export const maximumVisionImageSide = 4096
const directMediaTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

const encodeBase64 = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const chunks: string[] = []
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)))
  return btoa(chunks.join(''))
}

const encodeCanvas = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new LocalToolError('Unable to encode this image.'))),
      'image/jpeg',
      0.9,
    )
  })

const rasterize = async (bitmap: ImageBitmap, initialScale: number, signal?: AbortSignal) => {
  let scale = initialScale
  while (true) {
    signal?.throwIfAborted()
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new LocalToolError('Image conversion is unavailable in this browser.')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(bitmap, 0, 0, width, height)
    const blob = await encodeCanvas(canvas)
    signal?.throwIfAborted()
    if (blob.size <= maximumVisionImageBytes) return { blob, width, height, mimeType: 'image/jpeg' }
    if (width === 1 && height === 1)
      throw new LocalToolError('This image cannot be reduced to the vision input limit.')
    scale *= Math.min(0.9, Math.sqrt(maximumVisionImageBytes / blob.size) * 0.9)
  }
}

export type PreparedImage = ImageContent & { width: number; height: number }

export const prepareImage = async (
  blob: Blob,
  mediaType: string,
  signal?: AbortSignal,
): Promise<PreparedImage> => {
  signal?.throwIfAborted()
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch (cause) {
    signal?.throwIfAborted()
    throw new LocalToolError('This image could not be decoded in the browser.', { cause })
  }
  try {
    signal?.throwIfAborted()
    const scale = Math.min(
      1,
      maximumVisionImageSide / bitmap.width,
      maximumVisionImageSide / bitmap.height,
    )
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
    const converted = await rasterize(bitmap, scale, signal)
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
