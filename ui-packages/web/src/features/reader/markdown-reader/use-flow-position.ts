import { type RefObject, useCallback, useLayoutEffect, useRef } from 'react'
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
  const release = useRef<(() => void) | null>(null)

  // Images, formulas and diagrams finish after the text, pushing it down, so the place is applied
  // again whenever the content changes size — until the reader does anything, from which point
  // the position is theirs.
  const hold = useCallback((root: HTMLElement, scroll: HTMLElement, content: HTMLElement) => {
    release.current?.()
    const apply = () => {
      const target = place.current
      if (!target) return
      const blocks = blocksOf(content)
      scroll.scrollTop = flowScrollTop(target, blocks.length, measure(blocks, scroll))
    }
    const observer = new ResizeObserver(apply)
    const stop = () => {
      restoring.current = false
      observer.disconnect()
      readerInput.forEach(name => {
        root.removeEventListener(name, stop)
      })
      if (release.current === stop) release.current = null
    }
    restoring.current = true
    apply()
    observer.observe(content)
    readerInput.forEach(name => {
      root.addEventListener(name, stop, { passive: true })
    })
    release.current = stop
  }, [])

  useLayoutEffect(() => {
    const root = rootRef.current
    const scroll = scrollRef.current
    const content = contentRef.current
    if (!active || !root || !scroll || !content) return
    if (!place.current) {
      scroll.scrollTop = 0
      return
    }
    hold(root, scroll, content)
    return () => release.current?.()
  }, [active, contentRef, hold, rootRef, scrollRef])

  const placeAt = (scroll: HTMLElement, content: HTMLElement) => {
    const blocks = blocksOf(content)
    place.current = flowAnchorAt(blocks.length, measure(blocks, scroll), scroll.scrollTop)
    onPositionChange(place.current)
  }

  return {
    // Browsers deliver scroll at most once a frame, and finding the block takes a handful of reads.
    record: () => {
      const scroll = scrollRef.current
      const content = contentRef.current
      if (!active || restoring.current || !scroll || !content) return
      placeAt(scroll, content)
    },
    // Brings an element to the top and holds it there as the reading place, as a restored place
    // is held, so content that settles afterwards does not carry it away.
    show: (element: HTMLElement) => {
      const root = rootRef.current
      const scroll = scrollRef.current
      const content = contentRef.current
      if (!root || !scroll || !content) return
      scroll.scrollTop = pageTop(element) - pageTop(scroll)
      placeAt(scroll, content)
      hold(root, scroll, content)
    },
  }
}
