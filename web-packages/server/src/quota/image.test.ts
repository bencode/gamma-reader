import { describe, expect, it } from 'vitest'
import { dataUrlExtent, imageExtent } from './image.js'

const png = (width: number, height: number) => {
  const bytes = Buffer.alloc(24)
  bytes.writeUInt32BE(0x89504e47, 0)
  bytes.writeUInt32BE(0x0d0a1a0a, 4)
  bytes.writeUInt32BE(13, 8)
  bytes.write('IHDR', 12, 'ascii')
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  return bytes
}

// Optionally behind an application segment, which is where a camera puts the
// thumbnail that pushes the frame header further in than a reader might expect.
const jpeg = (width: number, height: number, padding = 0) => {
  const application = padding > 0 ? Buffer.concat([Buffer.from([0xff, 0xe1]), size(padding)]) : null
  const frame = Buffer.alloc(11)
  frame.writeUInt16BE(0xffd8, 0)
  frame.writeUInt16BE(0xffc0, 2)
  frame.writeUInt16BE(17, 4)
  frame.writeUInt8(8, 6)
  frame.writeUInt16BE(height, 7)
  frame.writeUInt16BE(width, 9)
  if (!application) return frame
  return Buffer.concat([
    frame.subarray(0, 2),
    application,
    Buffer.alloc(padding - 2),
    frame.subarray(2),
  ])
}

const size = (value: number) => {
  const bytes = Buffer.alloc(2)
  bytes.writeUInt16BE(value, 0)
  return bytes
}

const riff = (fourcc: string, payload: Buffer) => {
  const bytes = Buffer.alloc(16 + payload.length)
  bytes.write('RIFF', 0, 'ascii')
  bytes.writeUInt32LE(8 + payload.length, 4)
  bytes.write('WEBP', 8, 'ascii')
  bytes.write(fourcc, 12, 'ascii')
  payload.copy(bytes, 16)
  return bytes
}

const webpExtended = (width: number, height: number) => {
  const payload = Buffer.alloc(14)
  payload.writeUInt32LE(10, 0)
  payload.writeUIntLE(width - 1, 8, 3)
  payload.writeUIntLE(height - 1, 11, 3)
  return riff('VP8X', payload)
}

const webpLossless = (width: number, height: number) => {
  const payload = Buffer.alloc(9)
  payload.writeUInt32LE(5, 0)
  payload.writeUInt8(0x2f, 4)
  payload.writeUInt32LE((width - 1) | ((height - 1) << 14), 5)
  return riff('VP8L', payload)
}

const webpLossy = (width: number, height: number) => {
  const payload = Buffer.alloc(14)
  payload.writeUInt32LE(10, 0)
  payload.writeUInt16BE(0x9d01, 7)
  payload.writeUInt8(0x2a, 9)
  payload.writeUInt16LE(width, 10)
  payload.writeUInt16LE(height, 12)
  return riff('VP8 ', payload)
}

describe('imageExtent', () => {
  it.each([
    ['PNG', png(1920, 1080)],
    ['JPEG', jpeg(1920, 1080)],
    ['JPEG behind a thumbnail segment', jpeg(1920, 1080, 4_000)],
    ['extended WebP', webpExtended(1920, 1080)],
    ['lossless WebP', webpLossless(1920, 1080)],
    ['lossy WebP', webpLossy(1920, 1080)],
  ])('reads the size a %s states in its header', (_name, bytes) => {
    expect(imageExtent(new Uint8Array(bytes))).toEqual({ width: 1920, height: 1080 })
  })

  it('reads a picture far larger than the reader would ever render', () => {
    expect(imageExtent(new Uint8Array(png(8_000, 6_000)))).toEqual({
      width: 8_000,
      height: 6_000,
    })
  })

  it.each([
    ['empty', Buffer.alloc(0)],
    ['a truncated header', png(1920, 1080).subarray(0, 12)],
    ['another format entirely', Buffer.from('GIF89a', 'ascii')],
    ['bytes that are not an image', Buffer.from('A'.repeat(4_000), 'ascii')],
  ])('reports no size for %s', (_name, bytes) => {
    expect(imageExtent(new Uint8Array(bytes))).toBeNull()
  })
})

describe('dataUrlExtent', () => {
  it('reads the header out of a Base64 data URL', () => {
    const url = `data:image/png;base64,${png(1920, 1080).toString('base64')}`

    expect(dataUrlExtent(url)).toEqual({ width: 1920, height: 1080 })
  })

  it('reads a frame header without decoding the pixels behind it', () => {
    const image = Buffer.concat([jpeg(4_096, 4_096), Buffer.alloc(3_000_000)])
    const url = `data:image/jpeg;base64,${image.toString('base64')}`

    expect(dataUrlExtent(url)).toEqual({ width: 4_096, height: 4_096 })
  })

  it.each([
    ['is not Base64', 'data:image/png,not-encoded'],
    ['carries no comma', 'data:image/png;base64'],
    ['carries no data', 'data:image/png;base64,'],
  ])('reports no size for a URL that %s', (_name, url) => {
    expect(dataUrlExtent(url)).toBeNull()
  })
})
