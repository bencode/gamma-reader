// Which files of a repository a source holds: never git's own; none under a folder excluded;
// only those under a folder included, when any are; and none hidden, so no tool's settings,
// unless a folder included names the hidden one itself, as .github would. The same rule decides
// what is listed and what may be saved, so whatever the reader shows can be written back.
export type SourceScope = { include: readonly string[]; exclude: readonly string[] }

const under = (path: string, folder: string) => path.startsWith(`${folder}/`)

const hidden = (segments: readonly string[]) => segments.some(segment => segment.startsWith('.'))

export const inScope = (path: string, { include, exclude }: SourceScope) => {
  const segments = path.split('/')
  if (segments.some(segment => ['', '.', '..', '.git'].includes(segment))) return false
  if (exclude.some(folder => under(path, folder))) return false
  if (include.length === 0) return !hidden(segments)
  const folder = include.find(candidate => under(path, candidate))
  return folder !== undefined && !hidden(segments.slice(folder.split('/').length))
}
