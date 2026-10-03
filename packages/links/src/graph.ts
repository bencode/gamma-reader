import type { LinkTarget, ParsedLink, ParsedNote } from './parse'

// What the graph needs to know of a file in the library.
export type NoteFile = { id: string; path: string }

export type Resolution =
  | { kind: 'file'; fileId: string }
  | { kind: 'virtual'; page: string }
  | { kind: 'ambiguous'; fileIds: string[] }

export type Reference = { fileId: string; link: ParsedLink }

export type PageEntry = { page: string; title: string; fileIds: string[]; references: number }

const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1)

export const isNotePath = (path: string) => /\.md$/i.test(path)

// Pages are matched by name, never by path, so a file can move anywhere without breaking a link.
export const pageKey = (page: string) => page.trim().toLowerCase()

// A note is named by its frontmatter name, else its file name without .md or .lab.md; any other
// file keeps its whole name, as in [[paper.pdf]].
const titleOf = (file: NoteFile, note?: ParsedNote) =>
  note?.name ??
  (isNotePath(file.path) ? fileName(file.path).replace(/(\.lab)?\.md$/i, '') : fileName(file.path))

export const pageNameOf = (file: NoteFile, note?: ParsedNote) => pageKey(titleOf(file, note))

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

// The links between a library's files: which file a name points to, who links to a page, and every
// page there is, including a virtual one that is linked to but has no file.
export const buildGraph = (files: readonly NoteFile[], notes: ReadonlyMap<string, ParsedNote>) => {
  const byPage = groupBy(files, file => pageNameOf(file, notes.get(file.id)))
  const references: Reference[] = files.flatMap(file =>
    (notes.get(file.id)?.links ?? []).map(link => ({ fileId: file.id, link })),
  )
  const referencesTo = groupBy(references, reference => pageKey(reference.link.target.page))

  const resolve = (target: LinkTarget): Resolution => {
    const found = byPage.get(pageKey(target.page)) ?? []
    if (found.length === 0) return { kind: 'virtual', page: pageKey(target.page) }
    if (found.length === 1) return { kind: 'file', fileId: (found[0] as NoteFile).id }
    return { kind: 'ambiguous', fileIds: found.map(file => file.id) }
  }

  // Every link to a page, or only those to one of its blocks.
  const backlinks = (page: string, block?: string): Reference[] =>
    (referencesTo.get(pageKey(page)) ?? []).filter(
      reference => block === undefined || reference.link.target.block === block,
    )

  const pages = (): PageEntry[] => {
    const names = new Set([...byPage.keys(), ...referencesTo.keys()])
    return [...names].sort().map(page => {
      const owners = byPage.get(page) ?? []
      const first = owners[0]
      return {
        page,
        title: first
          ? titleOf(first, notes.get(first.id))
          : (referencesTo.get(page)?.[0]?.link.target.page ?? page),
        fileIds: owners.map(file => file.id),
        references: referencesTo.get(page)?.length ?? 0,
      }
    })
  }

  return { resolve, backlinks, pages }
}

export type LinkGraph = ReturnType<typeof buildGraph>
