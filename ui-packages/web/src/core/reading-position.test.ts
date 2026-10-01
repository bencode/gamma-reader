import { describe, expect, it } from 'vitest'
import { type BlockBox, flowAnchorAt, flowScrollTop, isReadingPosition } from './reading-position'

const layout = (heights: readonly number[]) => {
  const tops = heights.map((_, index) => heights.slice(0, index).reduce((sum, h) => sum + h, 0))
  return (index: number): BlockBox => ({ top: tops[index] ?? 0, height: heights[index] ?? 0 })
}

describe('flow reading positions', () => {
  it('returns to the same share of the same block after the text reflows', () => {
    const wide = layout([100, 300, 200])
    const anchor = flowAnchorAt(3, wide, 250)
    expect(anchor).toEqual({ kind: 'flow', block: 1, offset: 0.5 })

    // Narrower text wraps onto more lines, so every block grows and moves down.
    const narrow = layout([150, 600, 400])
    expect(flowScrollTop(anchor, 3, narrow)).toBe(150 + 300)
  })

  it('lands on the last block when the document has become shorter', () => {
    const box = layout([100, 100])
    expect(flowScrollTop({ kind: 'flow', block: 5, offset: 0.25 }, 2, box)).toBe(125)
  })

  it('rejects stored positions it could not restore', () => {
    expect(isReadingPosition({ kind: 'page', page: 3 })).toBe(true)
    expect(isReadingPosition({ kind: 'page', page: 0 })).toBe(false)
    expect(isReadingPosition({ kind: 'flow', block: 2, offset: 1 })).toBe(false)
    expect(isReadingPosition({ kind: 'sheet', sheet: 1, scrollTop: -4 })).toBe(false)
    expect(isReadingPosition({ kind: 'scroll', top: 10 })).toBe(false)
  })
})
