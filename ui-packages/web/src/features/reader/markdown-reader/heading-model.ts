import type { Heading, PhrasingContent, Root, RootContent } from 'mdast'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

export type MarkdownHeading = {
  id: string
  title: string
  level: 1 | 2 | 3 | 4 | 5 | 6
}

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath)

const phrasingText = (node: PhrasingContent): string => {
  if (node.type === 'text' || node.type === 'inlineCode' || node.type === 'inlineMath')
    return node.value
  if (node.type === 'image' || node.type === 'imageReference') return node.alt ?? ''
  if (node.type === 'break') return ' '
  return 'children' in node ? node.children.map(phrasingText).join('') : ''
}

const collectHeadings = (node: Root | RootContent): Heading[] => {
  if (node.type === 'heading') return [node]
  return 'children' in node ? node.children.flatMap(collectHeadings) : []
}

export const parseMarkdownHeadings = (source: string): MarkdownHeading[] =>
  collectHeadings(parser.parse(source)).map((heading, index) => ({
    id: `markdown-heading-${index + 1}`,
    title:
      heading.children.map(phrasingText).join('').replace(/\s+/gu, ' ').trim() ||
      'Untitled section',
    level: heading.depth,
  }))
