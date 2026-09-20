import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { issuePass, passLifetimeMs, verifyPass } from './pass.js'

const secret = 'a-server-secret'
const now = Date.parse('2026-09-20T12:00:00Z')
const encode = (value: string) => Buffer.from(value).toString('base64url')

describe('admission pass', () => {
  it('accepts its own pass until it expires', () => {
    const pass = issuePass(secret, now)

    expect(verifyPass(secret, pass, now)).toBe(true)
    expect(verifyPass(secret, pass, now + passLifetimeMs - 1)).toBe(true)
    expect(verifyPass(secret, pass, now + passLifetimeMs)).toBe(false)
  })

  it('rejects a pass signed with another secret', () => {
    expect(verifyPass(secret, issuePass('a-different-secret', now), now)).toBe(false)
  })

  it('rejects a tampered expiry or signature', () => {
    const [expiry = '', signature = ''] = issuePass(secret, now).split('.')

    // Pushing the expiry out invalidates the signature it was signed with.
    expect(
      verifyPass(secret, `${encode(String(now + 10 * passLifetimeMs))}.${signature}`, now),
    ).toBe(false)
    expect(verifyPass(secret, `${expiry}.${signature.slice(0, -1)}x`, now)).toBe(false)
  })

  it.each<{ shape: string; pass: string | undefined }>([
    { shape: 'absent', pass: undefined },
    { shape: 'empty', pass: '' },
    { shape: 'unsplittable', pass: 'no-separator' },
    { shape: 'empty on both sides', pass: '.' },
    { shape: 'over-segmented', pass: 'a.b.c.d' },
    { shape: 'signed at the wrong length', pass: `${encode(String(now))}.short` },
  ])('rejects a pass that is $shape without throwing', ({ pass }) => {
    expect(() => verifyPass(secret, pass, now)).not.toThrow()
    expect(verifyPass(secret, pass, now)).toBe(false)
  })

  // Signed correctly, so these reach the expiry check rather than stopping at
  // the signature — otherwise the guard against a non-finite expiry is untested.
  it.each(['1e999', 'not-a-number', '9007199254740993', '-1'])(
    'rejects a correctly signed pass whose expiry is %s',
    expiry => {
      const signature = createHmac('sha256', secret).update(expiry).digest('base64url')
      const pass = `${encode(expiry)}.${signature}`

      expect(verifyPass(secret, pass, now)).toBe(false)
    },
  )
})
