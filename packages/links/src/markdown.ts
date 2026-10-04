import type { Root, RootContent } from 'mdast'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

// The same plugins the reader renders with, so a block here is the block shown there.
export const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath)

export type Node = Root | RootContent

const unquote = (value: string) => value.replace(/^(['"])(.*)\1$/, '$2')

// Only a frontmatter name is read. The frontmatter is blanked rather than removed, so line
// numbers still match the source, and so its closing --- is not taken for a heading underline.
export const splitFrontmatter = (source: string) => {
  const lines = source.split('\n')
  const end =
    lines[0]?.trim() === '---' ? lines.findIndex((line, i) => i > 0 && line.trim() === '---') : -1
  if (end < 0) return { body: source, name: undefined }
  const name = lines
    .slice(1, end)
    .map(line => /^name:\s*(.+?)\s*$/.exec(line)?.[1])
    .find(value => value !== undefined)
  const body = [...lines.slice(0, end + 1).map(() => ''), ...lines.slice(end + 1)].join('\n')
  return { body, name: name ? unquote(name) : undefined }
}

const childrenOf = (node: Node): RootContent[] =>
  'children' in node ? (node.children as RootContent[]) : []

export const descendants = (node: Node): RootContent[] =>
  childrenOf(node).flatMap(child => [child, ...descendants(child)])

// Readable text of any node; code and math keep their source, raw HTML is left out.
export const plainText = (node: Node): string => {
  if (node.type === 'html') return ''
  if ('value' in node) return node.value
  return childrenOf(node)
    .map(plainText)
    .join(node.type === 'table' || node.type === 'tableRow' ? ' ' : '')
}

export const linesOf = (node: Node): [number, number] => [
  node.position?.start.line ?? 1,
  node.position?.end.line ?? 1,
]
