// `start` is the index of the '@'; `query` is what follows it up to the caret.
export type Mention = { start: number; query: string }

// An '@' right after what could be the start of an email address is no mention; after Chinese
// text or punctuation it is, as in 另外，@notes.md. The query ends at the first whitespace.
const mentionSigns = /(?<![A-Za-z0-9._%+-])@/g
const mentionBeforeCaret = /(?<![A-Za-z0-9._%+-])@([^\s@]*)$/

export const mentionAt = (text: string, caret: number): Mention | null => {
  const match = mentionBeforeCaret.exec(text.slice(0, caret))
  if (!match) return null
  const query = match[1] ?? ''
  return { start: caret - query.length - 1, query }
}

export const insertMention = (text: string, caret: number, mention: Mention, path: string) => {
  const inserted = `@${path} `
  return {
    text: `${text.slice(0, mention.start)}${inserted}${text.slice(caret)}`,
    caret: mention.start + inserted.length,
  }
}

// Paths may hold spaces, so each '@' takes the longest path the text goes on with: `@a.md.bak`
// names a.md.bak, not a.md.
export const referencedFiles = <F extends { id: string; path: string }>(
  text: string,
  files: readonly F[],
): F[] => {
  const longestFirst = [...files].sort((a, b) => b.path.length - a.path.length)
  const named = [...text.matchAll(mentionSigns)].flatMap(
    match => longestFirst.find(file => text.startsWith(file.path, match.index + 1)) ?? [],
  )
  return [...new Map(named.map(file => [file.id, file])).values()]
}
