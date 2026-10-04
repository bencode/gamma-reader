import type { Link, Parent, Root, RootContent, Text } from 'mdast'
import type {} from 'mdast-util-to-hast'
import { descendants, type Node, plainText } from './markdown'
import { headingKey } from './names'
import { linkPattern, namingsAmong, parseTarget, trailingName } from './parse'

// What the reader is given to work with, on the element a node becomes.
const setProperty = (node: Node, key: string, value: string) => {
  node.data = { ...node.data, hProperties: { ...node.data?.hProperties, [key]: value } }
}

// Names are marks for links to find, not text to read: the element a name names carries it as
// data-block, and the ^name itself is hidden.
const hideNames = (root: Root) => {
  const parents = [root, ...descendants(root)].filter(
    (node): node is Parent & Node => 'children' in node,
  )
  const namings = parents.flatMap(parent =>
    namingsAmong(parent).map(naming => ({ parent, naming })),
  )
  for (const { parent, naming } of namings) {
    setProperty(naming.owner, 'dataBlock', naming.name)
    if (naming.alone) {
      parent.children = parent.children.filter(child => child !== naming.mark)
      continue
    }
    const last = naming.mark.children.at(-1)
    if (last?.type === 'text') last.value = last.value.replace(trailingName, '')
  }
}

// A heading carries its title as a link would spell it, so [[Page#Title]] finds it.
const markHeadings = (root: Root) => {
  for (const node of descendants(root))
    if (node.type === 'heading') setProperty(node, 'dataHeading', headingKey(plainText(node)))
}

// A link becomes a button holding what was written, so a click can follow it once the library
// knows where it leads. It is a link node so Markdown keeps it inline; the empty url is not used.
const linkNode = (raw: string, embed: boolean, tag: boolean): Link => {
  const { label } = parseTarget(raw)
  const written = (raw.split('|')[0] ?? raw).trim()
  const shown = label ?? written
  return {
    type: 'link',
    url: '',
    children: [{ type: 'text', value: tag ? `#${shown}` : shown }],
    data: {
      hName: 'button',
      hProperties: {
        type: 'button',
        dataLink: raw,
        dataKind: embed ? 'embed' : tag ? 'tag' : 'link',
      },
    },
  }
}

// Text split around its links. [[#heading]] names no page, so it stays text, as it does in the
// index.
const splitLinks = (text: Text): (Text | Link)[] => {
  const pieces: (Text | Link)[] = []
  let from = 0
  for (const match of text.value.matchAll(linkPattern())) {
    const raw = match[3] ?? ''
    if (!parseTarget(raw).target.page) continue
    if (match.index > from)
      pieces.push({ type: 'text', value: text.value.slice(from, match.index) })
    pieces.push(linkNode(raw, match[1] === '!', match[2] === '#'))
    from = match.index + match[0].length
  }
  if (from === 0) return [text]
  if (from < text.value.length) pieces.push({ type: 'text', value: text.value.slice(from) })
  return pieces
}

// Text inside a Markdown link stays text, as a link inside a link cannot be followed.
const linkText = (parent: Parent) => {
  parent.children = parent.children.flatMap((child): RootContent[] => {
    if (child.type === 'text') return splitLinks(child)
    if ('children' in child && child.type !== 'link' && child.type !== 'linkReference')
      linkText(child)
    return [child]
  }) as Parent['children']
}

// The reader's view of a note's links and names, as remark plugin: [[...]], #[[...]] and ![[...]]
// become buttons that know their target, named blocks and headings carry the names links use,
// and ^name is hidden. Code and inline code are left alone, since only text nodes are read.
export const remarkLinks = () => (root: Root) => {
  hideNames(root)
  markHeadings(root)
  linkText(root)
}
