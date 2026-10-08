export const normalizeSearchText = (text: string) => text.replace(/\s+/gu, ' ').trim().toLowerCase()
export const normalizeNewlines = (text: string) => text.replace(/\r\n?/g, '\n')

// Text that is valid UTF-8, or null when it is not; any other failure is thrown.
export const decodeUtf8 = (bytes: ArrayBuffer) => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (cause) {
    if (cause instanceof TypeError) return null
    throw cause
  }
}

function* textMatches(text: string) {
  let offset = 0
  for (const [index, line] of text.split('\n').entries()) {
    const normalized = normalizeSearchText(line)
    if (!normalized) continue
    yield { text: normalized, line: index + 1, start: offset, end: offset + normalized.length }
    offset += normalized.length + 1
  }
}

export function* findTextMatches(text: string, query: string) {
  const lines = [...textMatches(text)]
  const searchable = lines.map(line => line.text).join(' ')
  let offset = searchable.indexOf(query)
  let previousStart = 0
  let previousEnd = 0
  while (offset !== -1) {
    const first = lines.find(line => line.end > offset)
    const last = lines.find(line => line.end >= offset + query.length)
    if (first && last && (first.line !== previousStart || last.line !== previousEnd)) {
      yield {
        start: first.line,
        end: last.line,
        excerpt: searchable.slice(
          Math.max(0, offset - 100),
          Math.min(searchable.length, offset + query.length + 100),
        ),
      }
      previousStart = first.line
      previousEnd = last.line
    }
    offset = searchable.indexOf(query, offset + Math.max(1, query.length))
  }
}
