import { type ParsedNote, parseTarget } from './parse'

// What the graph needs to know of a file in the library.
export type NoteFile = { id: string; path: string }

// A node, addressed as a link would be: a page, a block in it (RAG#^def), or a section of it
// under a heading (RAG#Retrieval). A page with no file is virtual: it exists because it is linked.
export type NodeRef = { page: string; block?: string; heading?: string }
export type NodeKind = 'page' | 'section' | 'block'

const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1)

export const isNotePath = (path: string) => /\.md$/i.test(path)

// Pages are matched by name, never by path, so a file can move anywhere without breaking a link.
export const pageKey = (page: string) => page.trim().toLowerCase()
export const headingKey = (heading: string) => heading.replace(/\s+/g, ' ').trim().toLowerCase()

// A note is named by its frontmatter name, else its file name without .md or .lab.md; any other
// file keeps its whole name, as in [[paper.pdf]].
export const pageTitleOf = (file: NoteFile, note?: ParsedNote) =>
  note?.name ??
  (isNotePath(file.path) ? fileName(file.path).replace(/(\.lab)?\.md$/i, '') : fileName(file.path))

export const pageNameOf = (file: NoteFile, note?: ParsedNote) => pageKey(pageTitleOf(file, note))

export const nodeKind = (ref: NodeRef): NodeKind =>
  ref.block !== undefined ? 'block' : ref.heading !== undefined ? 'section' : 'page'

// Nodes are named in link syntax, which a reader and a model already write. A PDF page is an
// anchor on an edge, not a node of its own.
export const nodeRef = (raw: string): NodeRef => {
  const { page, block, heading } = parseTarget(raw).target
  return block ? { page, block } : heading ? { page, heading } : { page }
}

export const formatNode = (ref: NodeRef) =>
  ref.block !== undefined
    ? `${ref.page}#^${ref.block}`
    : ref.heading !== undefined
      ? `${ref.page}#${ref.heading}`
      : ref.page

export const nodeKey = (ref: NodeRef) =>
  ref.block !== undefined
    ? `${pageKey(ref.page)}#^${ref.block}`
    : ref.heading !== undefined
      ? `${pageKey(ref.page)}#${headingKey(ref.heading)}`
      : pageKey(ref.page)
