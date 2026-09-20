import { describe, expect, it } from 'vitest'
import { fallbackTokens } from './charge.js'

const charge = (body: Record<string, unknown>) =>
  fallbackTokens(body, Buffer.byteLength(JSON.stringify(body)))

const dataUrl = (bytes: number) => `data:image/jpeg;base64,${'A'.repeat(bytes)}`

describe('fallbackTokens', () => {
  it('prices text by its size', () => {
    const prose = 'x'.repeat(40_000)

    expect(charge({ messages: [{ role: 'user', content: prose }] })).toBeGreaterThan(10_000)
    expect(charge({ messages: [{ role: 'user', content: prose }] })).toBeLessThan(10_200)
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
