import { type ParsedNote, parseNote } from '@gamma-reader/links'

// A Markdown file's note, or none when it is not UTF-8.
export const parseBlob = async (blob: Blob): Promise<ParsedNote | null> => {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(await blob.arrayBuffer())
  } catch (cause) {
    if (cause instanceof TypeError) return null
    throw cause
  }
  return parseNote(text)
}
