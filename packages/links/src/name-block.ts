import type { Parent, RootContent } from 'mdast'
import { parser, plainText, splitFrontmatter } from './markdown'
import { type BlockKind, nameSyntax, parseNote, standaloneName } from './parse'

// Why a passage could not be named, worded for whoever asked: a reader or a model.
export class NameBlockError extends Error {}

type Placed = { node: RootContent; parent: Parent; index: number }

// The passages that can be named, and the kinds of named block parseNote reads each as.
// Paragraphs and headings take a name at the end of their line; the rest take one on a line of
// their own after them. None of these nests inside another, so a passage falls in at most one.
const namedAs: Record<string, readonly BlockKind[]> = {
  paragraph: ['paragraph', 'item'],
  heading: ['heading', 'other'],
  table: ['other'],
  code: ['other'],
  math: ['other'],
}
const validName = new RegExp(`^${nameSyntax}$`)

const flat = (text: string) => text.replace(/\s+/g, ' ').trim()

const placedIn = (parent: Parent): Placed[] =>
  parent.children.flatMap((child, index) => [
    { node: child as RootContent, parent, index },
    ...('children' in child ? placedIn(child as Parent) : []),
  ])

// Names the one block that holds quote, so it can be linked as Page#^name, and gives back the
// source with the name in place. A block that already has a name keeps it, and nothing changes.
export const nameBlock = (input: string, quote: string, name: string) => {
  const lineBreak = input.includes('\r\n') ? '\r\n' : '\n'
  const source = input.replace(/\r\n?/g, '\n')
  // Case aside, as a quote copied by hand may differ in it; the match must still be unique.
  const wanted = flat(quote).toLowerCase()
  if (!wanted) throw new NameBlockError('Quote some text of the passage to name.')
  const root = parser.parse(splitFrontmatter(source).body)
  const matches = placedIn(root).filter(
    place =>
      namedAs[place.node.type] !== undefined &&
      !standaloneName.test(flat(plainText(place.node))) &&
      flat(plainText(place.node)).toLowerCase().includes(wanted),
  )
  const [match] = matches
  if (!match)
    throw new NameBlockError(
      'No passage holds that quote. Quote text from within one paragraph, list item, heading or table, as written there.',
    )
  if (matches.length > 1)
    throw new NameBlockError(`${matches.length} passages hold that quote. Quote more of it.`)
  const lines = source.split('\n')
  const { start, end } = match.node.position ?? { start: { line: 1, column: 1 }, end: { line: 1 } }
  // Lines indented by a tab or four spaces after a heading or paragraph are code to Markdown, as
  // happens when an outline is pasted under one. Naming that would name the whole of it.
  if (match.node.type === 'code' && !/^\s*(```|~~~)/.test(lines[start.line - 1] ?? ''))
    throw new NameBlockError(
      'That passage sits in an indented code block: Markdown reads lines indented by a tab or four spaces after a heading or paragraph as code, so it cannot be named on its own.',
    )
  // A name the passage already has is one parseNote reads as naming a block that starts with it.
  const { blocks } = parseNote(source)
  const kinds = namedAs[match.node.type] ?? []
  const named = blocks.find(block => block.lines[0] === start.line && kinds.includes(block.kind))
  if (named) return { source: input, name: named.name, created: false }
  if (!validName.test(name))
    throw new NameBlockError(
      'Use letters, digits and hyphens for the name, such as retrieval-first.',
    )
  if (blocks.some(block => block.name === name))
    throw new NameBlockError(`${name} already names another block in this note.`)

  if (match.node.type === 'paragraph' || match.node.type === 'heading') {
    // The name ends the text, which for a heading underlined with --- or === is the line above.
    const last = ('children' in match.node ? match.node.children.at(-1) : undefined)?.position
    const line = last?.end.line ?? end.line
    lines[line - 1] = `${(lines[line - 1] ?? '').replace(/\s+$/, '')} ^${name}`
  } else {
    // A name on its own line needs a blank line before it, and after it unless one follows, or
    // it would run into the text around it.
    const indent = ' '.repeat(Math.max(0, start.column - 1))
    const following = lines[end.line]
    const tail = following !== undefined && following.trim() !== '' ? [''] : []
    lines.splice(end.line, 0, '', `${indent}^${name}`, ...tail)
  }
  // The name must land on the passage that was quoted, starting where it starts: a list item
  // named through its first paragraph starts there too. Anything else is refused, not saved.
  const result = lines.join('\n')
  const landed = parseNote(result).blocks.find(block => block.name === name)
  if (!landed || landed.lines[0] !== start.line)
    throw new NameBlockError('This passage cannot carry a name.')
  return { source: result.replace(/\n/g, lineBreak), name, created: true }
}
