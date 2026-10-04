import { type BlockKind, type LinkTarget, type ParsedNote, parseTarget } from './parse'

// What the graph needs to know of a file in the library.
export type NoteFile = { id: string; path: string }

export type Resolution =
  | { kind: 'file'; fileId: string }
  | { kind: 'virtual'; page: string }
  | { kind: 'ambiguous'; fileIds: string[] }

// A node, addressed as a link would be: a page, a block in it (RAG#^def), or a section of it
// under a heading (RAG#Retrieval). A page with no file is virtual: it exists because it is linked.
export type NodeRef = { page: string; block?: string; heading?: string }
export type NodeKind = 'page' | 'section' | 'block'

// Where a link stands: a line of a file, inside the innermost named block and section around it.
export type Location = {
  fileId: string
  path: string
  page: string
  line: number
  block?: string
  section?: string
}

// An edge is a link: from a place in one note to a node, maybe at a PDF page.
export type Edge = {
  from: Location
  to: LinkTarget
  kind: 'link' | 'tag' | 'embed'
  context: string
}

export type OutlineEntry =
  | { kind: 'section'; title: string; level: number; lines: [number, number] }
  | { kind: 'block'; name: string; type: BlockKind; lines: [number, number]; text: string }

// What a node holds: a page its files and, for one file, the sections and blocks within it; a
// block or section its file, lines and text.
export type NodeView =
  | { kind: 'page'; ref: NodeRef; files: NoteFile[]; outline: OutlineEntry[] }
  | {
      kind: 'block' | 'section'
      ref: NodeRef
      file: NoteFile
      lines: [number, number]
      text: string
    }

export type FoundNode = { ref: NodeRef; kind: NodeKind; references: number; virtual?: true }

const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1)

export const isNotePath = (path: string) => /\.md$/i.test(path)

// Pages are matched by name, never by path, so a file can move anywhere without breaking a link.
export const pageKey = (page: string) => page.trim().toLowerCase()
const headingKey = (heading: string) => heading.replace(/\s+/g, ' ').trim().toLowerCase()

// A note is named by its frontmatter name, else its file name without .md or .lab.md; any other
// file keeps its whole name, as in [[paper.pdf]].
const titleOf = (file: NoteFile, note?: ParsedNote) =>
  note?.name ??
  (isNotePath(file.path) ? fileName(file.path).replace(/(\.lab)?\.md$/i, '') : fileName(file.path))

export const pageNameOf = (file: NoteFile, note?: ParsedNote) => pageKey(titleOf(file, note))

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

const nodeKey = (ref: NodeRef) =>
  ref.block !== undefined
    ? `${pageKey(ref.page)}#^${ref.block}`
    : ref.heading !== undefined
      ? `${pageKey(ref.page)}#${headingKey(ref.heading)}`
      : pageKey(ref.page)

const groupBy = <T>(items: readonly T[], key: (item: T) => string) => {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const name = key(item)
    const group = groups.get(name)
    if (group) group.push(item)
    else groups.set(name, [item])
  }
  return groups
}

const span = (lines: readonly [number, number]) => lines[1] - lines[0]
const holds = (lines: readonly [number, number], line: number) =>
  lines[0] <= line && line <= lines[1]

// The innermost of the ranges that hold a line.
const innermost = <T extends { lines: [number, number] }>(items: readonly T[], line: number) =>
  items
    .filter(item => holds(item.lines, line))
    .reduce<T | undefined>(
      (best, item) => (!best || span(item.lines) < span(best.lines) ? item : best),
      undefined,
    )

const outlineOf = (note: ParsedNote): OutlineEntry[] =>
  [
    ...note.headings.map(heading => ({
      kind: 'section' as const,
      title: heading.title,
      level: heading.level,
      lines: heading.lines,
    })),
    ...note.blocks.map(block => ({
      kind: 'block' as const,
      name: block.name,
      type: block.kind,
      lines: block.lines,
      text: block.text,
    })),
  ].sort((a, b) => a.lines[0] - b.lines[0] || (a.kind === 'section' ? -1 : 1))

const edgesOf = (file: NoteFile, note: ParsedNote): Edge[] => {
  const page = titleOf(file, note)
  const sections = note.headings.map(heading => ({ ...heading, name: heading.title }))
  return note.links.map(link => {
    const block = innermost(note.blocks, link.line)?.name
    const section = innermost(sections, link.line)?.name
    return {
      from: {
        fileId: file.id,
        path: file.path,
        page,
        line: link.line,
        ...(block ? { block } : {}),
        ...(section ? { section } : {}),
      },
      to: link.target,
      kind: link.embed ? 'embed' : link.tag ? 'tag' : 'link',
      context: link.context,
    }
  })
}

// The links between a library's files as a graph. Nodes are pages, the sections and named
// blocks within them, and virtual pages that are only linked to; edges are links, each from a
// line of a note. Everything a question about links needs follows from three operations: find a
// node, look inside one, and follow its edges in or out.
export const buildGraph = (files: readonly NoteFile[], notes: ReadonlyMap<string, ParsedNote>) => {
  const byPage = groupBy(files, file => pageNameOf(file, notes.get(file.id)))
  const edges = files.flatMap(file => {
    const note = notes.get(file.id)
    return note ? edgesOf(file, note) : []
  })
  const incoming = groupBy(edges, edge => pageKey(edge.to.page))
  const outgoing = groupBy(edges, edge => edge.from.fileId)
  const references = new Map(
    [...groupBy(edges, edge => nodeKey(edge.to)).entries()].map(([key, group]) => [
      key,
      group.length,
    ]),
  )

  const filesOf = (ref: NodeRef, fileId?: string) =>
    (byPage.get(pageKey(ref.page)) ?? []).filter(file => fileId === undefined || file.id === fileId)

  // A page's own name, however a query spelled it: its file's title, or for a virtual page the
  // way it is first written where it is linked.
  const titleFor = (key: string) => {
    const owner = byPage.get(key)?.[0]
    return owner
      ? titleOf(owner, notes.get(owner.id))
      : (incoming.get(key)?.[0]?.to.page.trim() ?? key)
  }

  const resolve = (target: LinkTarget): Resolution => {
    const found = byPage.get(pageKey(target.page)) ?? []
    if (found.length === 0) return { kind: 'virtual', page: pageKey(target.page) }
    if (found.length === 1) return { kind: 'file', fileId: (found[0] as NoteFile).id }
    return { kind: 'ambiguous', fileIds: found.map(file => file.id) }
  }

  // Inside a node, named as the graph names it rather than as the query spelled it. A page shared
  // by several files shows its outline only once one is chosen; a block or section needs its page
  // to come down to one file.
  const node = (ref: NodeRef, fileId?: string): NodeView | null => {
    const owners = filesOf(ref, fileId)
    const kind = nodeKind(ref)
    const page = titleFor(pageKey(ref.page))
    if (kind === 'page') {
      if (owners.length === 0 && !incoming.has(pageKey(ref.page))) return null
      const only = owners.length === 1 ? owners[0] : undefined
      const note = only ? notes.get(only.id) : undefined
      return { kind, ref: { page }, files: owners, outline: note ? outlineOf(note) : [] }
    }
    const file = owners.length === 1 ? owners[0] : undefined
    const note = file ? notes.get(file.id) : undefined
    if (!file || !note) return null
    if (kind === 'block') {
      const block = note.blocks.find(candidate => candidate.name === ref.block)
      return block
        ? { kind, ref: { page, block: block.name }, file, lines: block.lines, text: block.text }
        : null
    }
    const wanted = headingKey(ref.heading ?? '')
    const heading = note.headings.find(candidate => headingKey(candidate.title) === wanted)
    return heading
      ? {
          kind,
          ref: { page, heading: heading.title },
          file,
          lines: heading.lines,
          text: heading.title,
        }
      : null
  }

  // Edges into a node come by name, so a page gathers the links to its blocks and sections too.
  // Edges out of a node are the links written inside it: a whole file for a page, the lines of a
  // block or section otherwise.
  const edgesOfNode = (ref: NodeRef, direction: 'in' | 'out', fileId?: string): Edge[] => {
    const kind = nodeKind(ref)
    if (direction === 'in') {
      const toPage = incoming.get(pageKey(ref.page)) ?? []
      if (kind === 'page') return toPage
      return toPage.filter(edge => nodeKey(edge.to) === nodeKey(ref))
    }
    if (kind === 'page') return filesOf(ref, fileId).flatMap(file => outgoing.get(file.id) ?? [])
    const view = node(ref, fileId)
    if (!view || view.kind === 'page') return []
    return (outgoing.get(view.file.id) ?? []).filter(edge => holds(view.lines, edge.from.line))
  }

  // Nodes whose name holds the query, ignoring case, the most linked first. An empty query lists
  // pages alone.
  const find = (query: string): FoundNode[] => {
    const wanted = query.trim().toLowerCase()
    const pageNames = new Set([...byPage.keys(), ...incoming.keys()])
    const pages = [...pageNames].flatMap((key): FoundNode[] => {
      if (!key.includes(wanted)) return []
      return [
        {
          ref: { page: titleFor(key) },
          kind: 'page',
          references: incoming.get(key)?.length ?? 0,
          ...(byPage.has(key) ? {} : { virtual: true as const }),
        },
      ]
    })
    const inside = wanted
      ? files.flatMap(file => {
          const note = notes.get(file.id)
          if (!note) return []
          const page = titleOf(file, note)
          const found = (ref: NodeRef): FoundNode => ({
            ref,
            kind: nodeKind(ref),
            references: references.get(nodeKey(ref)) ?? 0,
          })
          return [
            ...note.headings
              .filter(heading => heading.title.toLowerCase().includes(wanted))
              .map(heading => found({ page, heading: heading.title })),
            ...note.blocks
              .filter(block => block.name.toLowerCase().includes(wanted))
              .map(block => found({ page, block: block.name })),
          ]
        })
      : []
    const order: Record<NodeKind, number> = { page: 0, section: 1, block: 2 }
    return [...pages, ...inside].sort(
      (a, b) =>
        b.references - a.references ||
        order[a.kind] - order[b.kind] ||
        formatNode(a.ref).localeCompare(formatNode(b.ref)),
    )
  }

  return { resolve, node, edges: edgesOfNode, find }
}

export type LinkGraph = ReturnType<typeof buildGraph>
