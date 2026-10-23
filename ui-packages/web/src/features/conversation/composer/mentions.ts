// An @ names a file and a # a conversation.
export type MentionSign = '@' | '#'

// `start` is the index of the sign; `query` is what follows it up to the caret.
export type Mention = { start: number; query: string }

// One entry of an @ or # list: what it is called, where it is, and its tooltip.
export type MentionOption = { id: string; name: string; detail: string; title: string }

// A sign right after what could be part of a word or an email address is no mention, as in
// a@b.com, C# or Page#Heading; after Chinese text or punctuation it is, as in 另外，@notes.md.
const notAfterWord = '(?<![A-Za-z0-9._%+-])'

export const mentionSigns = (sign: MentionSign) => new RegExp(`${notAfterWord}${sign}`, 'g')

// The query ends at the first whitespace.
export const mentionAt = (sign: MentionSign, text: string, caret: number): Mention | null => {
  const match = new RegExp(`${notAfterWord}${sign}([^\\s${sign}]*)$`).exec(text.slice(0, caret))
  if (!match) return null
  const query = match[1] ?? ''
  return { start: caret - query.length - 1, query }
}

// The token replaces the mention, sign included: @notes.md or #k3X9qA.
export const insertMention = (text: string, caret: number, mention: Mention, token: string) => {
  const inserted = `${token} `
  return {
    text: `${text.slice(0, mention.start)}${inserted}${text.slice(caret)}`,
    caret: mention.start + inserted.length,
  }
}
