import { auxiliaryTextSelector } from '../../core/document-text'
import type { ReaderState } from '../../core/reader-state'

type Clip = { top: number; bottom: number; left: number; right: number }

const intersects = (rect: DOMRect, clip: Clip) =>
  rect.width > 0 &&
  rect.height > 0 &&
  rect.right > clip.left &&
  rect.left < clip.right &&
  rect.bottom > clip.top &&
  rect.top < clip.bottom

const clippedBounds = (parent: HTMLElement, clip: Clip): Clip => {
  const bounds = { ...clip }
  let element: HTMLElement | null = parent
  while (element) {
    const style = getComputedStyle(element)
    const box = element.getBoundingClientRect()
    if (['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX)) {
      bounds.left = Math.max(bounds.left, box.left + element.clientLeft)
      bounds.right = Math.min(bounds.right, box.left + element.clientLeft + element.clientWidth)
    }
    if (['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowY)) {
      bounds.top = Math.max(bounds.top, box.top + element.clientTop)
      bounds.bottom = Math.min(bounds.bottom, box.top + element.clientTop + element.clientHeight)
    }
    element = element.parentElement
  }
  return bounds
}

const visibleCharacters = (
  node: Node,
  clip: Clip,
  append: (char: string) => void,
  flush: () => void,
) => {
  const text = node.textContent ?? ''
  const range = document.createRange()
  const visit = (start: number, end: number) => {
    range.setStart(node, start)
    range.setEnd(node, end)
    if (!intersects(range.getBoundingClientRect(), clip)) {
      flush()
      return
    }
    // Plain-text previews can have megabytes in one node. Prune invisible ranges first.
    if (end - start > 64) {
      let middle = Math.floor((start + end) / 2)
      if (/[\uDC00-\uDFFF]/.test(text[middle] ?? '')) middle++
      visit(start, middle)
      visit(middle, end)
      return
    }
    let offset = start
    for (const char of text.slice(start, end)) {
      range.setStart(node, offset)
      offset += char.length
      range.setEnd(node, offset)
      const visible = [...range.getClientRects()].some(
        rect =>
          intersects(rect, clip) &&
          (rect.left + rect.right) / 2 >= clip.left &&
          (rect.left + rect.right) / 2 <= clip.right &&
          (rect.top + rect.bottom) / 2 >= clip.top &&
          (rect.top + rect.bottom) / 2 <= clip.bottom,
      )
      if (visible || !/\S/u.test(char)) append(char)
      else flush()
    }
  }
  if (text) visit(0, text.length)
}

const textRuns = (root: HTMLElement, clip: Clip) => {
  const sourceSelector = '[data-math-source], [data-diagram-source]'
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: node => {
      if (node.parentElement?.closest(`${auxiliaryTextSelector}, ${sourceSelector}`))
        return NodeFilter.FILTER_REJECT
      if (node instanceof Element && node.matches(auxiliaryTextSelector))
        return NodeFilter.FILTER_REJECT
      return node.nodeType === Node.TEXT_NODE ||
        (node instanceof Element && node.matches(sourceSelector))
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP
    },
  })
  const runs: string[] = []
  let current = ''
  let block: Element | null = null
  const flush = () => {
    if (current.trim()) runs.push(current.replace(/\s+/gu, ' ').trim())
    current = ''
  }
  let node = walker.nextNode()
  while (node) {
    const parent = node instanceof HTMLElement ? node : node.parentElement
    if (parent && !parent.closest(auxiliaryTextSelector)) {
      const nextBlock = parent.closest(
        'p,h1,h2,h3,h4,h5,h6,li,pre,td,th,.textLayer > span,[data-math-display="true"],[data-diagram-source]',
      )
      if (block !== nextBlock) {
        flush()
        block = nextBlock
      }
      const source = parent.dataset.mathSource ?? parent.dataset.diagramSource
      if (source !== undefined && node === parent) {
        const bounds = clippedBounds(parent, clip)
        if (
          getComputedStyle(parent).visibility !== 'hidden' &&
          [...parent.getClientRects()].some(rect => intersects(rect, bounds))
        )
          current += source
        else flush()
      } else if (getComputedStyle(parent).visibility !== 'hidden')
        visibleCharacters(
          node,
          clippedBounds(parent, clip),
          char => {
            current += char
          },
          flush,
        )
      else flush()
    }
    node = walker.nextNode()
  }
  flush()
  return runs
}

export const readViewport = (
  root: HTMLElement | null,
  scroll: HTMLElement | null,
): ReaderState['viewport'] => {
  if (!root || !scroll || !root.getClientRects().length) return null
  const box = scroll.getBoundingClientRect()
  const clip = {
    top: Math.max(0, box.top),
    bottom: Math.min(innerHeight, box.bottom),
    left: Math.max(0, box.left),
    right: Math.min(innerWidth, box.right),
  }
  const runs = textRuns(root, clip)
  const first = runs[0]
  const last = runs.at(-1)
  return first && last
    ? {
        startText: [...first].slice(0, 100).join('').trim(),
        endText: [...last].slice(-100).join('').trim(),
      }
    : null
}
