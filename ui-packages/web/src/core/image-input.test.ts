import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  documentPagePixels,
  maximumVisionImageSide,
  prepareImage,
  readerImagePixels,
} from './image-input'

const originalCreateImageBitmap = globalThis.createImageBitmap
const bitmap = (width: number, height: number) =>
  ({ width, height, close: vi.fn() }) as unknown as ImageBitmap

afterEach(() => {
  globalThis.createImageBitmap = originalCreateImageBitmap
})

describe('vision image preparation', () => {
  it('preserves a small supported image', async () => {
    const decoded = bitmap(320, 200)
    globalThis.createImageBitmap = vi.fn(async () => decoded)
    const result = await prepareImage(
      new Blob(['image'], { type: 'image/png' }),
      'image/png',
      readerImagePixels,
    )
    expect(result).toEqual({
      type: 'image',
      data: btoa('image'),
      mimeType: 'image/png',
      width: 320,
      height: 200,
    })
    expect(decoded.close).toHaveBeenCalled()
  })

  it('scales an oversized image to its pixel budget rather than its longest side', async () => {
    const decoded = bitmap(8000, 4000)
    globalThis.createImageBitmap = vi.fn(async () => decoded)
    const context = {
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => {
      callback(new Blob(['converted'], { type: 'image/jpeg' }))
    })
    const result = await prepareImage(
      new Blob(['large'], { type: 'image/png' }),
      'image/png',
      readerImagePixels,
    )
    // The longest side alone would have allowed 4096x2048, eight times the pixels.
    expect(result.width).toBeLessThan(maximumVisionImageSide)
    expect(result.width * result.height).toBeLessThanOrEqual(readerImagePixels)
    expect(result.width * result.height).toBeGreaterThan(readerImagePixels * 0.95)
    expect(result.width / result.height).toBeCloseTo(2, 2)
    expect(context.drawImage).toHaveBeenCalledWith(decoded, 0, 0, result.width, result.height)
    expect(decoded.close).toHaveBeenCalled()
  })

  it('reduces dimensions until the encoded image fits the payload limit', async () => {
    const decoded = bitmap(5000, 2500)
    globalThis.createImageBitmap = vi.fn(async () => decoded)
    const context = {
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
    const oversized = new Blob([new Uint8Array(8 * 1024 * 1024 + 1)], {
      type: 'image/jpeg',
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementationOnce(callback => callback(oversized))
      .mockImplementationOnce(callback => callback(new Blob(['fits'], { type: 'image/jpeg' })))
    const result = await prepareImage(
      new Blob(['large'], { type: 'image/png' }),
      'image/png',
      readerImagePixels,
    )
    expect(context.drawImage).toHaveBeenCalledTimes(2)
    expect(result.width).toBeLessThan(maximumVisionImageSide)
    expect(result.width / result.height).toBeCloseTo(2, 2)
    expect(result.data).toBe(btoa('fits'))
  })

  it('gives a rendered document page its own budget, not the reader image one', async () => {
    const decoded = bitmap(2000, 1500)
    globalThis.createImageBitmap = vi.fn(async () => decoded)
    const context = {
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => {
      callback(new Blob(['converted'], { type: 'image/jpeg' }))
    })
    const source = () => new Blob(['page'], { type: 'image/png' })

    // Three megapixels: within what a scanned page may keep, twice what an
    // upload is worth. Lowering the latter must not quietly shrink the former.
    const page = await prepareImage(source(), 'image/png', documentPagePixels)
    const upload = await prepareImage(source(), 'image/png', readerImagePixels)

    expect(page.width * page.height).toBe(2000 * 1500)
    // Each dimension is rounded, so the budget is a target rather than an exact ceiling.
    expect((upload.width * upload.height) / readerImagePixels).toBeCloseTo(1, 2)
    expect(upload.width / upload.height).toBeCloseTo(2000 / 1500, 2)
  })

  it('reports decoding failures and honors cancellation', async () => {
    globalThis.createImageBitmap = vi.fn(async () => {
      throw new DOMException('Invalid image', 'InvalidStateError')
    })
    await expect(prepareImage(new Blob(['bad']), 'image/png', readerImagePixels)).rejects.toThrow(
      'could not be decoded',
    )
    const controller = new AbortController()
    controller.abort()
    await expect(
      prepareImage(new Blob(['image']), 'image/png', readerImagePixels, controller.signal),
    ).rejects.toThrow('aborted')
  })
})
