import { describe, expect, it } from 'vitest'
import { readableProxyError } from './proxy-error'

describe('readableProxyError', () => {
  it('recovers the sentence a proxy refusal carries in its body', () => {
    expect(readableProxyError('429: {"message":"The daily chat limit is used up."}')).toBe(
      'The daily chat limit is used up.',
    )
    expect(readableProxyError('502: {"message":"Could not connect to the model provider."}')).toBe(
      'Could not connect to the model provider.',
    )
  })

  it.each([
    undefined,
    '',
    'Could not generate a reply.',
    '429: not json at all',
    '429: {"code":"over_limit"}',
    '429: {"message":""}',
  ])('leaves %p unchanged', message => {
    expect(readableProxyError(message)).toBe(message)
  })
})
