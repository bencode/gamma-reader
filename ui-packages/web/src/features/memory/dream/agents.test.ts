import { describe, expect, it } from 'vitest'
import { abstractDue, tidyDue } from './agents'

const now = 100 * 24 * 60 * 60 * 1000
const daysAgo = (days: number) => now - days * 24 * 60 * 60 * 1000
const at = (lastRunAt: number | null) => ({ projectKey: 'p', lastRunAt })

describe('when the notes are worth reorganizing', () => {
  it('tidies once five notes have changed and a day has passed', () => {
    expect(tidyDue(4, at(null), now)).toBe(0)
    expect(tidyDue(5, at(null), now)).toBe(5)
    expect(tidyDue(9, at(daysAgo(0.5)), now)).toBe(0)
    expect(tidyDue(5, at(daysAgo(1.5)), now)).toBe(5)
  })

  it('abstracts after ten new notes, or any after a week', () => {
    expect(abstractDue(9, at(daysAgo(1)), now)).toBe(0)
    expect(abstractDue(10, at(daysAgo(1)), now)).toBe(10)
    expect(abstractDue(1, at(daysAgo(8)), now)).toBe(1)
    expect(abstractDue(0, at(daysAgo(8)), now)).toBe(0)
    expect(abstractDue(1, at(null), now)).toBe(1)
  })
})
