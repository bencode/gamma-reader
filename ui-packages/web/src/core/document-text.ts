import type { Root, RootContent } from 'hast'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { markdownPlugins, normalizeMath } from './markdown-math'

const textBlockTags = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'pre',
  'li',
  'tr',
  'blockquote',
  'ul',
  'ol',
  'table',
  'section',
])
export const auxiliaryTextSelector =
  'button, [data-footnote-ref], [data-footnote-backref], #footnote-label'
export const normalizeSearchText = (text: string) => text.replace(/\s+/gu, ' ').trim().toLowerCase()
export const normalizeNewlines = (text: string) => text.replace(/\r\n?/g, '\n')
export const imagePlaceholder = (alt?: string) => (alt ? `[Image: ${alt}]` : '[Image omitted]')

const parser = unified().use(remarkParse).use(markdownPlugins).use(remarkRehype)

const bodyText = (node: Root | RootContent): string => {
  if (node.type === 'text') return node.value
  if (node.type !== 'element' && node.type !== 'root') return ''
  if (node.type === 'root') return node.children.map(bodyText).join('')
  const properties = node.properties
  if (
    Object.hasOwn(properties, 'dataFootnoteRef') ||
    Object.hasOwn(properties, 'dataFootnoteBackref') ||
    properties.id === 'footnote-label'
  )
    return ''
  if (typeof properties.dataMathSource === 'string')
    return properties.dataMathDisplay === 'true'
      ? `\n${properties.dataMathSource}\n`
      : properties.dataMathSource
  if (node.tagName === 'img') return imagePlaceholder(String(properties.alt ?? ''))
  if (node.tagName === 'br') return '\n'
  const content = node.children.map(bodyText).join('')
  if (textBlockTags.has(node.tagName)) return `\n${content}\n`
  return node.tagName === 'td' || node.tagName === 'th' ? `${content}\t` : content
}

export const markdownText = (source: string) => {
  const normalized = normalizeMath(source)
  return normalizeNewlines(bodyText(parser.runSync(parser.parse(normalized), normalized)))
    .replace(/\t+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '')
}

function* textMatches(text: string) {
  let offset = 0
  for (const [index, line] of text.split('\n').entries()) {
    const normalized = normalizeSearchText(line)
    if (!normalized) continue
    yield { text: normalized, line: index + 1, start: offset, end: offset + normalized.length }
    offset += normalized.length + 1
  }
}

export function* findTextMatches(text: string, query: string) {
  const lines = [...textMatches(text)]
  const searchable = lines.map(line => line.text).join(' ')
  let offset = searchable.indexOf(query)
  let previousStart = 0
  let previousEnd = 0
  while (offset !== -1) {
    const first = lines.find(line => line.end > offset)
    const last = lines.find(line => line.end >= offset + query.length)
    if (first && last && (first.line !== previousStart || last.line !== previousEnd)) {
      yield {
        start: first.line,
        end: last.line,
        excerpt: searchable.slice(
          Math.max(0, offset - 100),
          Math.min(searchable.length, offset + query.length + 100),
        ),
      }
      previousStart = first.line
      previousEnd = last.line
    }
    offset = searchable.indexOf(query, offset + Math.max(1, query.length))
  }
}
