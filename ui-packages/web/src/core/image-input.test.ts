import { afterEach, describe, expect, it, vi } from 'vitest'
import { maximumVisionImageSide, prepareImage } from './image-input'

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
    const result = await prepareImage(new Blob(['image'], { type: 'image/png' }), 'image/png')
    expect(result).toEqual({
      type: 'image',
      data: btoa('image'),
      mimeType: 'image/png',
      width: 320,
      height: 200,
    })
    expect(decoded.close).toHaveBeenCalled()
  })

  it('rasterizes an oversized image without cropping its aspect ratio', async () => {
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
    const result = await prepareImage(new Blob(['large'], { type: 'image/png' }), 'image/png')
    expect(result).toMatchObject({
      mimeType: 'image/jpeg',
      width: maximumVisionImageSide,
      height: maximumVisionImageSide / 2,
    })
    expect(context.drawImage).toHaveBeenCalledWith(
      decoded,
      0,
      0,
      maximumVisionImageSide,
      maximumVisionImageSide / 2,
    )
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
    const result = await prepareImage(new Blob(['large'], { type: 'image/png' }), 'image/png')
    expect(context.drawImage).toHaveBeenCalledTimes(2)
    expect(result.width).toBeLessThan(maximumVisionImageSide)
    expect(result.width / result.height).toBeCloseTo(2, 2)
    expect(result.data).toBe(btoa('fits'))
  })

  it('reports decoding failures and honors cancellation', async () => {
    globalThis.createImageBitmap = vi.fn(async () => {
      throw new DOMException('Invalid image', 'InvalidStateError')
    })
    await expect(prepareImage(new Blob(['bad']), 'image/png')).rejects.toThrow(
      'could not be decoded',
    )
    const controller = new AbortController()
    controller.abort()
    await expect(prepareImage(new Blob(['image']), 'image/png', controller.signal)).rejects.toThrow(
      'aborted',
    )
  })
})
