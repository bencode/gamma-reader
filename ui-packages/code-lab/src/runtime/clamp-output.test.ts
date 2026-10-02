import { describe, expect, it } from 'vitest'
import { clampText } from './clamp-output'

const numberedLines = (count: number): string =>
  Array.from({ length: count }, (_, index) => `line ${index}`).join('\n')

describe('clampText', () => {
  it('leaves teaching-sized output untouched', () => {
    const text = numberedLines(2_000)
    expect(clampText(text)).toBe(text)
  })

  it('keeps whole lines from the head and tail and counts what it omits', () => {
    const lines = numberedLines(100_000).split('\n')
    const clamped = clampText(lines.join('\n')).split('\n')
    const note = clamped.findIndex(line => line.startsWith('…'))
    const head = clamped.slice(0, note)
    const tail = clamped.slice(note + 1)

    expect(head).toEqual(lines.slice(0, head.length))
    expect(tail).toEqual(lines.slice(-tail.length))
    expect(clamped[note]).toBe(
      `… ${(lines.length - head.length - tail.length).toLocaleString('en-US')} lines omitted …`,
    )
  })

  it('cuts a single long line by characters', () => {
    const clamped = clampText('x'.repeat(100_000))
    expect(clamped).toBe(
      `${'x'.repeat(32_000)}\n… 36,000 characters omitted …\n${'x'.repeat(32_000)}`,
    )
  })
})
