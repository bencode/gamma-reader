import { describe, expect, it } from 'vitest'
import { burstIdleMs, burstLifetimeMs, createBurstTracker } from './burst.js'

const start = Date.parse('2026-09-20T12:00:00Z')

describe('burst tracker', () => {
  it('keeps one question together and separates the next', () => {
    const tracker = createBurstTracker()
    const round = tracker.of('a', start)

    expect(tracker.of('a', start + 1_000)).toBe(round)
    expect(tracker.of('a', start + 1_000 + burstIdleMs)).toBe(round)
    expect(tracker.of('a', start + 2_000 + 2 * burstIdleMs)).not.toBe(round)
  })

  it('stops extending a burst once it reaches its lifetime', () => {
    const tracker = createBurstTracker()
    const round = tracker.of('a', start)
    // Stay continuously active, one call per idle window, past the cap.
    let at = start
    while (at < start + burstLifetimeMs) {
      at += burstIdleMs
      expect(tracker.of('a', at)).toBe(round)
    }

    expect(tracker.of('a', at + burstIdleMs)).not.toBe(round)
  })

  it('gives concurrent subjects their own burst', () => {
    const tracker = createBurstTracker()

    expect(tracker.of('a', start)).not.toBe(tracker.of('b', start))
  })

  it('forgets only subjects idle before the cutoff', () => {
    const tracker = createBurstTracker()
    const stale = tracker.of('a', start)
    const recent = tracker.of('b', start + burstLifetimeMs)
    tracker.sweep(start + burstLifetimeMs)

    expect(tracker.of('a', start + burstLifetimeMs)).not.toBe(stale)
    expect(tracker.of('b', start + burstLifetimeMs)).toBe(recent)
  })
})
