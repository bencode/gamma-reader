import { createHmac, timingSafeEqual } from 'node:crypto'

export const passCookieName = 'gamma_pass'
export const passLifetimeMs = 30 * 24 * 60 * 60 * 1000

const sign = (secret: string, expiry: string) =>
  createHmac('sha256', secret).update(expiry).digest('base64url')

export const issuePass = (secret: string, now = Date.now()) => {
  const expiry = String(now + passLifetimeMs)
  return `${Buffer.from(expiry).toString('base64url')}.${sign(secret, expiry)}`
}

export const verifyPass = (secret: string, pass: string | undefined, now = Date.now()) => {
  const [encodedExpiry, signature] = pass?.split('.') ?? []
  if (!encodedExpiry || !signature) return false
  const expiry = Buffer.from(encodedExpiry, 'base64url').toString()
  const expected = Buffer.from(sign(secret, expiry))
  const received = Buffer.from(signature)
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false
  const expiresAt = Number(expiry)
  return Number.isSafeInteger(expiresAt) && now < expiresAt
}
