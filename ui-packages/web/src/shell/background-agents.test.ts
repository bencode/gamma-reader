import { describe, expect, it, vi } from 'vitest'
import { setMemoryEnabled } from '../features/memory/settings'
import { runBackgroundAgentsOnOpen } from './background-agents'

describe('background agents on open', () => {
  it('asks no model anything when no agent has work', async () => {
    setMemoryEnabled(true)
    const fetchModel = vi.spyOn(globalThis, 'fetch')
    await runBackgroundAgentsOnOpen()
    expect(fetchModel).not.toHaveBeenCalled()
    setMemoryEnabled(false)
  })
})
