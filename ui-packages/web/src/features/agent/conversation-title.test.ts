import { describe, expect, it } from 'vitest'
import { cleanTitle } from './conversation-title'

describe('conversation titles from a model reply', () => {
  it('keeps the bare first line', () => {
    expect(cleanTitle('"Noticing birds at dawn."\nThis title captures the essay.')).toBe(
      'Noticing birds at dawn',
    )
    expect(cleanTitle('标题：《观察记录》里的数量变化。')).toBe('《观察记录》里的数量变化')
    expect(cleanTitle('  **Gamma function and factorials**  ')).toBe(
      'Gamma function and factorials',
    )
  })

  it('shortens a runaway reply and treats an empty one as no title', () => {
    expect(Array.from(cleanTitle('word '.repeat(40)))).toHaveLength(60)
    expect(cleanTitle(' \n"" ')).toBe('')
  })
})
