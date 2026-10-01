// Where a reader stopped in a document, in the terms its format can restore: a PDF by page, text
// that reflows by block, and a sheet by tab and fixed-height rows.
export type ReadingPosition =
  | { kind: 'page'; page: number }
  | { kind: 'flow'; block: number; offset: number }
  | { kind: 'sheet'; sheet: number; scrollTop: number }

export type FlowPosition = Extract<ReadingPosition, { kind: 'flow' }>

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

export const isReadingPosition = (value: unknown): value is ReadingPosition => {
  if (typeof value !== 'object' || value === null || !('kind' in value)) return false
  if (value.kind === 'page') return 'page' in value && isCount(value.page) && value.page >= 1
  if (value.kind === 'flow')
    return (
      'block' in value &&
      isCount(value.block) &&
      'offset' in value &&
      typeof value.offset === 'number' &&
      value.offset >= 0 &&
      value.offset < 1
    )
  if (value.kind === 'sheet')
    return (
      'sheet' in value &&
      isCount(value.sheet) &&
      'scrollTop' in value &&
      typeof value.scrollTop === 'number' &&
      value.scrollTop >= 0
    )
  return false
}

export type BlockBox = { top: number; height: number }

// A pixel offset means a different paragraph once the width or text size changes. A block and
// the share of it already scrolled past survive both, so that is what a flow position keeps.
export const flowAnchorAt = (
  count: number,
  box: (index: number) => BlockBox,
  scrollTop: number,
): FlowPosition => {
  if (count === 0) return { kind: 'flow', block: 0, offset: 0 }
  // Blocks are laid out in order, so the last one starting at or above the top is found by halving.
  let low = 0
  let high = count - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (box(middle).top <= scrollTop) low = middle
    else high = middle - 1
  }
  const { top, height } = box(low)
  const offset = height > 0 ? (scrollTop - top) / height : 0
  return { kind: 'flow', block: low, offset: Math.min(Math.max(offset, 0), 0.999) }
}

export const flowScrollTop = (
  position: FlowPosition,
  count: number,
  box: (index: number) => BlockBox,
) => {
  if (count === 0) return 0
  const { top, height } = box(Math.min(position.block, count - 1))
  return top + position.offset * height
}

// A reader takes its starting place once, when it mounts, then keeps its own and reports changes:
// the defaultValue and onChange of an uncontrolled input.
export type ReadingPositionProps = {
  defaultPosition?: ReadingPosition
  onPositionChange: (position: ReadingPosition) => void
}
