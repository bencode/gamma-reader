import { type RefObject, useLayoutEffect, useRef } from 'react'
import {
  type BlockBox,
  type FlowPosition,
  flowAnchorAt,
  flowScrollTop,
  type ReadingPositionProps,
} from '../../../core/reading-position'

// Rendered Markdown keeps its blocks in one container; plain text is a single <pre>.
const blocksOf = (content: HTMLElement) => [
  ...(content.querySelector(':scope > .markdown-content') ?? content).children,
]

// Layout offsets ignore scrolling, so a block's place in the scrolled content is its offset from
// the page less the scroll container's own.
const pageTop = (element: Element) => {
  let top = 0
  let node: Element | null = element
  while (node instanceof HTMLElement) {
    top += node.offsetTop
    node = node.offsetParent
  }
  return top
}

const measure = (blocks: readonly Element[], scroll: HTMLElement) => {
  const origin = pageTop(scroll)
  return (index: number): BlockBox => {
    const block = blocks[index]
    return block instanceof HTMLElement
      ? { top: pageTop(block) - origin, height: block.offsetHeight }
      : { top: 0, height: 0 }
  }
}

const readerInput = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const

type FlowPositionOptions = ReadingPositionProps & {
  rootRef: RefObject<HTMLElement | null>
  scrollRef: RefObject<HTMLElement | null>
  contentRef: RefObject<HTMLElement | null>
  active: boolean
}

export const useFlowPosition = ({
  rootRef,
  scrollRef,
  contentRef,
  active,
  defaultPosition,
  onPositionChange,
}: FlowPositionOptions) => {
  const place = useRef<FlowPosition | null>(
    defaultPosition?.kind === 'flow' ? defaultPosition : null,
  )
  const restoring = useRef(false)

  // Images, formulas and diagrams finish after the text, pushing it down, so the place is applied
  // again whenever the content changes size — until the reader does anything, from which point
  // the position is theirs.
  useLayoutEffect(() => {
    const root = rootRef.current
    const scroll = scrollRef.current
    const content = contentRef.current
    if (!active || !root || !scroll || !content) return
    const target = place.current
    if (!target) {
      scroll.scrollTop = 0
      return
    }
    const apply = () => {
      const blocks = blocksOf(content)
      scroll.scrollTop = flowScrollTop(target, blocks.length, measure(blocks, scroll))
    }
    const observer = new ResizeObserver(apply)
    const release = () => {
      restoring.current = false
      observer.disconnect()
      readerInput.forEach(name => {
        root.removeEventListener(name, release)
      })
    }
    restoring.current = true
    apply()
    observer.observe(content)
    readerInput.forEach(name => {
      root.addEventListener(name, release, { passive: true })
    })
    return release
  }, [active, contentRef, rootRef, scrollRef])

  // Browsers deliver scroll at most once a frame, and finding the block takes a handful of reads.
  return () => {
    const scroll = scrollRef.current
    const content = contentRef.current
    if (!active || restoring.current || !scroll || !content) return
    const blocks = blocksOf(content)
    place.current = flowAnchorAt(blocks.length, measure(blocks, scroll), scroll.scrollTop)
    onPositionChange(place.current)
  }
}
