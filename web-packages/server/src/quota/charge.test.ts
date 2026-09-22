import { describe, expect, it } from 'vitest'
import { fallbackTokens, requestImages } from './charge.js'

const charge = (body: Record<string, unknown>) =>
  fallbackTokens(body, Buffer.byteLength(JSON.stringify(body)), requestImages(body))

// No readable header, so this is charged a whole budget: the expensive way in.
const dataUrl = (bytes: number) => `data:image/jpeg;base64,${'A'.repeat(bytes)}`

const png = (width: number, height: number) => {
  const bytes = Buffer.alloc(24)
  bytes.writeUInt32BE(0x89504e47, 0)
  bytes.writeUInt32BE(0x0d0a1a0a, 4)
  bytes.writeUInt32BE(13, 8)
  bytes.write('IHDR', 12, 'ascii')
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  return `data:image/png;base64,${bytes.toString('base64')}`
}

const picture = (url: string) => ({
  messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url } }] }],
})

describe('fallbackTokens', () => {
  it('prices text by its size', () => {
    const prose = 'x'.repeat(40_000)

    expect(charge({ messages: [{ role: 'user', content: prose }] })).toBeGreaterThan(10_000)
    expect(charge({ messages: [{ role: 'user', content: prose }] })).toBeLessThan(10_200)
  })

  it('prices a picture by the pixels it covers, not the bytes it arrives in', () => {
    const small = charge(picture(png(640, 480)))
    const large = charge(picture(png(3_000, 2_000)))

    // 0.31 MP against 6 MP, at about 1,500 tokens for each megapixel.
    expect(small).toBeGreaterThan(400)
    expect(small).toBeLessThan(600)
    expect(large).toBeGreaterThan(8_900)
    expect(large).toBeLessThan(9_100)
  })

  it('charges a whole budget for a header it cannot read, leaving no cheap unknown', () => {
    const unreadable = charge(picture(dataUrl(1_000)))
    const readable = charge(picture(png(1_024, 1_024)))

    expect(unreadable).toBeGreaterThan(readable)
    expect(unreadable).toBeGreaterThanOrEqual(6_000)
  })

  it('prices an image per image, not by the size of its data', () => {
    const small = charge({
      messages: [
        { role: 'user', content: [{ type: 'image_url', image_url: { url: dataUrl(1_000) } }] },
      ],
    })
    const large = charge({
      messages: [
        { role: 'user', content: [{ type: 'image_url', image_url: { url: dataUrl(4_000_000) } }] },
      ],
    })

    // Four megabytes of base64 would be a million tokens priced by size.
    expect(large).toBe(small)
    expect(large).toBeLessThan(7_000)
  })

  it('adds the output the caller reserved, which the charge once left out', () => {
    const body = {
      max_tokens: 4096,
      messages: [
        { role: 'user', content: [{ type: 'image_url', image_url: { url: dataUrl(500) } }] },
      ],
    }

    expect(charge(body)).toBe(charge({ ...body, max_tokens: 0 }) + 4096)
  })

  it('counts each image separately', () => {
    const one = [{ type: 'image_url', image_url: { url: dataUrl(500) } }]
    const single = charge({ messages: [{ role: 'user', content: one }] })
    const pair = charge({ messages: [{ role: 'user', content: [...one, ...one] }] })

    // The flat charge for the second image, plus the few bytes of JSON wrapping
    // it, which is text and priced as such.
    expect(pair - single).toBeGreaterThanOrEqual(6_000)
    expect(pair - single).toBeLessThan(6_100)
  })

  it('leaves no cheaper route for text dressed as an image request', () => {
    const prose = 'x'.repeat(40_000)
    const asImage = charge({
      messages: [
        { role: 'user', content: [{ type: 'image_url', image_url: { url: dataUrl(500) } }] },
        { role: 'user', content: prose },
      ],
    })

    // The prose is still paid for; only the base64 is exempt from sizing.
    expect(asImage).toBeGreaterThan(16_000)
  })
})
