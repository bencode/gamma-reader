import type { Heading, Parent, PhrasingContent, Root, Text } from 'mdast'
import { descendants, linesOf, type Node, parser, plainText, splitFrontmatter } from './markdown'

// Where a link points: a page by name, and optionally a named block, a heading or a PDF page in
// it. A page is named as written; matching it to a file is the graph's concern.
export type LinkTarget = { page: string; block?: string; heading?: string; pdfPage?: number }

export type ParsedLink = {
  target: LinkTarget
  label?: string
  embed: boolean
  tag: boolean
  // One-based source line, and that line as written, for showing the link where it stands.
  line: number
  context: string
}

export type BlockKind = 'paragraph' | 'item' | 'heading' | 'other'

// A block someone named with ^name. Its lines are what a reference to it covers: a list item with
// the items under it, a heading with its whole section.
export type ParsedBlock = { name: string; kind: BlockKind; lines: [number, number]; text: string }

export type ParsedHeading = { title: string; level: Heading['depth']; lines: [number, number] }

export type ParsedNote = {
  name?: string
  headings: ParsedHeading[]
  blocks: ParsedBlock[]
  links: ParsedLink[]
}

const contextLength = 200
export const nameSyntax = '[A-Za-z0-9-]+'
const trailingName = new RegExp(`\\s\\^(${nameSyntax})$`)
export const standaloneName = new RegExp(`^\\^(${nameSyntax})$`)

// [[...]], ![[...]] for an embed, #[[...]] for a tag. A fresh expression each time, since a global
// one carries its position from one search to the next.
const linkPattern = () => /(!?)(#?)\[\[([^[\]\n]+)\]\]/g

// The inside of [[...]]: a page, then #^block, #page=N or #heading, then |label.
export const parseTarget = (raw: string): { target: LinkTarget; label?: string } => {
  const bar = raw.indexOf('|')
  const reference = bar < 0 ? raw : raw.slice(0, bar)
  const label = bar < 0 ? '' : raw.slice(bar + 1).trim()
  const hash = reference.indexOf('#')
  const page = (hash < 0 ? reference : reference.slice(0, hash)).trim()
  const fragment = hash < 0 ? '' : reference.slice(hash + 1).trim()
  const block = standaloneName.exec(fragment)?.[1]
  const pdfPage = /^page=(\d+)$/.exec(fragment)?.[1]
  const target: LinkTarget = block
    ? { page, block }
    : pdfPage
      ? { page, pdfPage: Number(pdfPage) }
      : fragment
        ? { page, heading: fragment }
        : { page }
  return label ? { target, label } : { target }
}

const compact = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, contextLength)

const lastText = (node: Parent): Text | undefined => {
  const last = node.children.at(-1) as PhrasingContent | undefined
  return last?.type === 'text' ? last : undefined
}

const nameAtEnd = (node: Parent) => {
  const text = lastText(node)
  return text ? trailingName.exec(text.value)?.[1] : undefined
}

const withoutName = (text: string) => text.replace(trailingName, '')

const linksIn = (text: Text, source: readonly string[]): ParsedLink[] => {
  const { value } = text
  let line = text.position?.start.line ?? 1
  let counted = 0
  return [...value.matchAll(linkPattern())].flatMap(match => {
    // Only the line breaks since the previous link are counted, so a long paragraph stays linear.
    for (
      let at = value.indexOf('\n', counted);
      at !== -1 && at < match.index;
      at = value.indexOf('\n', at + 1)
    )
      line += 1
    counted = match.index
    const { target, label } = parseTarget(match[3] ?? '')
    // [[#heading]] points inside its own page, which is not a link between pages.
    if (!target.page) return []
    return [
      {
        target,
        ...(label ? { label } : {}),
        embed: match[1] === '!',
        tag: match[2] === '#',
        line,
        context: compact(source[line - 1] ?? ''),
      },
    ]
  })
}

// A heading's section runs to the next heading at its level or above, without trailing blanks.
const headingsIn = (root: Root, source: readonly string[]): ParsedHeading[] => {
  const headings = descendants(root).filter((node): node is Heading => node.type === 'heading')
  return headings.map((heading, index) => {
    const [start] = linesOf(heading)
    const next = headings.slice(index + 1).find(later => later.depth <= heading.depth)
    let end = next ? linesOf(next)[0] - 1 : source.length
    while (end > start && (source[end - 1] ?? '').trim() === '') end -= 1
    return {
      title: compact(withoutName(plainText(heading))),
      level: heading.depth,
      lines: [start, end],
    }
  })
}

// Blocks named among one parent's children. A name ending a paragraph or heading names it; one
// ending the first paragraph of a list item names the item; a paragraph that is only ^name names
// the block before it, which is how a table, code block or quote is named.
const blocksAmong = (parent: Parent, headings: readonly ParsedHeading[]): ParsedBlock[] =>
  parent.children.flatMap((child, index): ParsedBlock[] => {
    if (child.type === 'paragraph') {
      const alone = standaloneName.exec(plainText(child).trim())?.[1]
      const previous = parent.children[index - 1]
      if (alone && previous)
        return [
          {
            name: alone,
            kind: previous.type === 'paragraph' ? 'paragraph' : 'other',
            lines: linesOf(previous),
            text: compact(plainText(previous)),
          },
        ]
      const name = nameAtEnd(child)
      if (!name) return []
      const item = parent.type === 'listItem' && index === 0
      return [
        {
          name,
          kind: item ? 'item' : 'paragraph',
          lines: linesOf(item ? (parent as Node) : child),
          text: compact(withoutName(plainText(child))),
        },
      ]
    }
    if (child.type === 'heading') {
      const name = nameAtEnd(child)
      const [start] = linesOf(child)
      const section = headings.find(heading => heading.lines[0] === start)
      return name && section
        ? [{ name, kind: 'heading', lines: section.lines, text: section.title }]
        : []
    }
    return []
  })

// One Markdown note's headings, named blocks and links, with one-based source lines. Code and
// inline code are left alone, since only text nodes are read.
export const parseNote = (input: string): ParsedNote => {
  const normalized = input.replace(/\r\n?/g, '\n')
  const { body, name } = splitFrontmatter(normalized)
  const source = body.split('\n')
  const root = parser.parse(body)
  const nodes = descendants(root)
  const headings = headingsIn(root, source)
  const parents = [root, ...nodes].filter(
    (node): node is Parent & Node => 'children' in node && node.children.length > 0,
  )
  return {
    ...(name ? { name } : {}),
    headings,
    blocks: parents.flatMap(parent => blocksAmong(parent, headings)),
    links: nodes
      .filter((node): node is Text => node.type === 'text')
      .flatMap(text => linksIn(text, source)),
  }
}
