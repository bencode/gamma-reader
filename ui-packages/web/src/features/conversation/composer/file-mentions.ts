import { baseName } from '../../../utils/path'
import { type MentionOption, mentionSigns } from './mentions'

export type NamedFile = { id: string; path: string }

// A name that starts with the query comes first, then a name that holds it, then a path that
// does; null when nothing matches. A bare @ starts every name.
const matchRank = (path: string, query: string) => {
  const name = baseName(path).toLowerCase()
  if (name.startsWith(query)) return 0
  if (name.includes(query)) return 1
  return path.toLowerCase().includes(query) ? 2 : null
}

// Ties go to the files opened most recently, then to path order, as the file tree shows them.
export const rankMentions = <F extends NamedFile>(
  files: readonly F[],
  query: string,
  recentIds: readonly string[],
): F[] => {
  const lowered = query.toLowerCase()
  const recency = new Map(recentIds.map((id, index) => [id, index]))
  const recent = (file: F) => recency.get(file.id) ?? recentIds.length
  return files
    .flatMap(file => {
      const rank = matchRank(file.path, lowered)
      return rank === null ? [] : [{ file, rank }]
    })
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        recent(a.file) - recent(b.file) ||
        a.file.path.localeCompare(b.file.path),
    )
    .slice(0, 8)
    .map(entry => entry.file)
}

// Paths may hold spaces, so each '@' takes the longest path the text goes on with: `@a.md.bak`
// names a.md.bak, not a.md.
export const referencedFiles = <F extends NamedFile>(text: string, files: readonly F[]): F[] => {
  const longestFirst = [...files].sort((a, b) => b.path.length - a.path.length)
  const named = [...text.matchAll(mentionSigns('@'))].flatMap(
    match => longestFirst.find(file => text.startsWith(file.path, match.index + 1)) ?? [],
  )
  return [...new Map(named.map(file => [file.id, file])).values()]
}

// Adds `@path ` at the end unless the text names that file already, read as a sent message is.
export const appendMention = (text: string, file: NamedFile, files: readonly NamedFile[]) =>
  referencedFiles(text, files).some(named => named.id === file.id)
    ? text
    : `${text}${text && !/\s$/.test(text) ? ' ' : ''}@${file.path} `

const folderOf = (path: string) => path.slice(0, Math.max(path.lastIndexOf('/'), 0))

export const fileOption = (file: NamedFile): MentionOption => ({
  id: file.id,
  name: baseName(file.path),
  detail: folderOf(file.path),
  title: file.path,
})
