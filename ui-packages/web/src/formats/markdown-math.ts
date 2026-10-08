import type { Root, RootContent } from 'mdast'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import { type PluggableList, type Plugin, unified } from 'unified'

const sourceParser = unified().use(remarkParse).use(remarkGfm).use(remarkMath)
const codeRanges = (node: Root | RootContent): [number, number][] => {
  if (node.type === 'code' || node.type === 'inlineCode' || node.type === 'html') {
    const start = node.position?.start.offset
    const end = node.position?.end.offset
    return start !== undefined && end !== undefined ? [[start, end]] : []
  }
  return 'children' in node ? node.children.flatMap(codeRanges) : []
}

const normalizeProse = (source: string) => {
  const pattern = /(?<!\\)(?:\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$\$([\s\S]*?)\$\$|\$\$)/g
  return source.replace(
    pattern,
    (
      match,
      display: string | undefined,
      inline: string | undefined,
      dollars: string | undefined,
    ) => {
      if (inline !== undefined) return `$${inline}$`
      const formula = display ?? dollars
      if (formula !== undefined) return `\n\n$$\n${formula.trim()}\n$$\n\n`
      // An unfinished display fence otherwise consumes the rest of a streamed message.
      return match === '$$' ? '\\$\\$' : match
    },
  )
}

export const normalizeMath = (source: string) => {
  const protectedRanges = codeRanges(sourceParser.parse(source))
  let offset = 0
  const parts = protectedRanges.flatMap(([start, end]) => {
    const prose = normalizeProse(source.slice(offset, start))
    offset = end
    return [prose, source.slice(start, end)]
  })
  return [...parts, normalizeProse(source.slice(offset))].join('')
}

const markSources: Plugin<[], Root> = () => (tree, file) => {
  const visit = (node: Root | RootContent) => {
    if (node.type === 'math' || node.type === 'inlineMath') {
      const display = node.type === 'math'
      node.data = {
        ...node.data,
        hName: 'span',
        hProperties: {
          className: ['math-node'],
          dataMathSource: node.value,
          dataMathDisplay: String(display),
        },
        hChildren: [
          {
            type: 'element',
            tagName: 'code',
            properties: { className: [display ? 'math-display' : 'math-inline'] },
            children: [{ type: 'text', value: node.value }],
          },
        ],
      }
    }
    if (node.type === 'code' && node.lang?.toLowerCase() === 'mermaid') {
      const source = String(file.value).slice(
        node.position?.start.offset,
        node.position?.end.offset,
      )
      const lines = source.trimEnd().split('\n')
      const opening = lines[0]?.match(/^\s*(`{3,}|~{3,})/)?.[1]
      const closing = lines.at(-1)?.trim()
      const closed = Boolean(
        opening &&
          lines.length > 1 &&
          closing &&
          closing.length >= opening.length &&
          [...closing].every(char => char === opening[0]),
      )
      node.data = {
        ...node.data,
        hProperties: { className: ['language-mermaid'], dataDiagramClosed: String(closed) },
      }
    }
    if ('children' in node) node.children.forEach(visit)
  }
  visit(tree)
}

export const markdownPlugins: PluggableList = [remarkGfm, remarkMath, markSources]
