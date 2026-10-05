// Which files of a repository a source holds: none hidden, so neither git's own nor a tool's
// settings; only those under the folders included, when any are; none under a folder excluded.
// The same rule decides what is listed and what may be saved, so whatever the reader shows can be
// written back.
export type SourceScope = { include: readonly string[]; exclude: readonly string[] }

const under = (path: string, folder: string) => path.startsWith(`${folder}/`)

export const inScope = (path: string, { include, exclude }: SourceScope) =>
  path.split('/').every(segment => segment !== '' && !segment.startsWith('.')) &&
  (include.length === 0 || include.some(folder => under(path, folder))) &&
  !exclude.some(folder => under(path, folder))
