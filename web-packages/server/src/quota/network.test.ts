import { describe, expect, it } from 'vitest'
import { networkOf } from './network.js'

describe('networkOf', () => {
  it.each([
    ['203.0.113.7', '203.0.113.7'],
    ['::ffff:203.0.113.7', '203.0.113.7'],
    ['::FFFF:203.0.113.7', '203.0.113.7'],
    ['unknown', 'unknown'],
  ])('leaves %s addressable on its own', (address, expected) => {
    expect(networkOf(address)).toBe(expected)
  })

  it('collapses an IPv6 subscriber onto one allowance however its half rotates', () => {
    const rotated = [
      '2001:db8:85a3:8d3:1319:8a2e:370:7348',
      '2001:db8:85a3:8d3:aaaa:bbbb:cccc:dddd',
      '2001:DB8:85A3:8D3:1:2:3:4',
      '2001:db8:85a3:8d3::1',
    ].map(networkOf)

    expect(new Set(rotated).size).toBe(1)
    expect(rotated[0]).toBe('2001:db8:85a3:8d3::/64')
  })

  it('expands compressed zeros so one network is not counted as two', () => {
    expect(networkOf('2001:db8::1')).toBe(networkOf('2001:db8:0:0:1:2:3:4'))
    expect(networkOf('2001:db8::1')).toBe('2001:db8:0:0::/64')
  })

  it('keeps separate networks apart', () => {
    expect(networkOf('2001:db8:85a3:8d3::1')).not.toBe(networkOf('2001:db8:85a3:8d4::1'))
    expect(networkOf('203.0.113.7')).not.toBe(networkOf('203.0.113.8'))
  })
})
