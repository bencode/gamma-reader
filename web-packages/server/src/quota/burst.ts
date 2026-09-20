import { randomInt } from 'node:crypto'

// A burst groups the requests one agent loop makes for a single question, so the
// recorded token amounts can be read back as rounds. It is minted here and never
// leaves the process: nothing links one burst to the next, or to an address.
export const burstIdleMs = 60_000
export const burstLifetimeMs = 30 * 60_000

type Burst = { burst: number; startedAt: number; lastAt: number }

const continues = (current: Burst, at: number) =>
  at - current.lastAt <= burstIdleMs && at - current.startedAt <= burstLifetimeMs

export const createBurstTracker = () => {
  const active = new Map<string, Burst>()

  return {
    of: (subject: string, at: number) => {
      const current = active.get(subject)
      if (current && continues(current, at)) {
        current.lastAt = at
        return current.burst
      }
      const burst = randomInt(2 ** 48 - 1)
      active.set(subject, { burst, startedAt: at, lastAt: at })
      return burst
    },
    sweep: (before: number) => {
      for (const [subject, current] of active) {
        if (current.lastAt < before) active.delete(subject)
      }
    },
  }
}
