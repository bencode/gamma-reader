import type { Parent, Text } from 'mdast'
import { parser } from './markdown'
import { type EmbedSize, formatSize, linkPattern, splitSize } from './parse'

// Text a reader finds links in, in document order: none in code, none inside a Markdown link.
const linkableTexts = (parent: Parent): Text[] =>
  parent.children.flatMap(child =>
    child.type === 'text'
      ? [child]
      : 'children' in child && child.type !== 'link' && child.type !== 'linkReference'
        ? linkableTexts(child)
        : [],
  )

// The source with the nth embed written as ![[raw]], counted as the reader counts them, given
// the size; null when the source has no such embed. Only the size changes, so a label stays.
export const resizeEmbed = (source: string, raw: string, nth: number, size: EmbedSize) => {
  const occurrences = linkableTexts(parser.parse(source)).flatMap(text => {
    const start = text.position?.start.offset
    const end = text.position?.end.offset
    if (start === undefined || end === undefined) return []
    // Offsets come from the source, as a text node's value may have lost escapes.
    return [...source.slice(start, end).matchAll(linkPattern())]
      .filter(match => match[1] === '!' && match[3] === raw)
      .map(match => ({ at: start + match.index, length: match[0].length, mark: match[2] }))
  })
  const found = occurrences[nth]
  if (!found) return null
  const written = `!${found.mark}[[${splitSize(raw).raw}|${formatSize(size)}]]`
  return source.slice(0, found.at) + written + source.slice(found.at + found.length)
}
