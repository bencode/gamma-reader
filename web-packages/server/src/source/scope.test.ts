import { describe, expect, it } from 'vitest'
import { inScope } from './scope.js'

describe('source scope', () => {
  it('holds the whole repository but hidden and excluded paths', () => {
    const scope = { include: [], exclude: ['meta'] }

    expect(inScope('README.md', scope)).toBe(true)
    expect(inScope('sun/orbit.p5.js', scope)).toBe(true)
    expect(inScope('meta/index.json', scope)).toBe(false)
    expect(inScope('.github/ci.yml', scope)).toBe(false)
    expect(inScope('notes/.draft.md', scope)).toBe(false)
  })

  it('opens a hidden folder that is included by name, but nothing hidden within it', () => {
    const scope = { include: ['.github', 'notes'], exclude: [] }

    expect(inScope('.github/workflows/ci.yml', scope)).toBe(true)
    expect(inScope('.github/.cache/x', scope)).toBe(false)
    expect(inScope('notes/a.md', scope)).toBe(true)
    expect(inScope('notes/.obsidian/app.json', scope)).toBe(false)
    expect(inScope('README.md', scope)).toBe(false)
  })

  it('never holds git itself or a path that climbs', () => {
    expect(inScope('.git/config', { include: ['.git'], exclude: [] })).toBe(false)
    expect(inScope('notes/../x.md', { include: [], exclude: [] })).toBe(false)
  })
})
