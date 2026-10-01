const delimiters = [',', ';', '\t'] as const
// Written as a code point: the character itself is invisible in source.
const byteOrderMark = String.fromCodePoint(0xfeff)

// Spreadsheets in much of Europe export with semicolons, and tab-separated data often arrives
// named .csv; the first record says which, counting only outside quoted fields.
const delimiterOf = (text: string) => {
  const counts = new Map<string, number>(delimiters.map(delimiter => [delimiter, 0]))
  let quoted = false
  for (const char of text) {
    if (char === '"') quoted = !quoted
    else if (!quoted && (char === '\n' || char === '\r')) break
    else if (!quoted && counts.has(char)) counts.set(char, (counts.get(char) ?? 0) + 1)
  }
  return delimiters.reduce((best, delimiter) =>
    (counts.get(delimiter) ?? 0) > (counts.get(best) ?? 0) ? delimiter : best,
  )
}

// RFC 4180: a quoted field may hold the delimiter, line breaks, and quotes written twice. A quote
// left open runs to the end of the file rather than failing, so a damaged file still shows.
export const parseCsv = (source: string): string[][] => {
  const text = source.startsWith(byteOrderMark) ? source.slice(1) : source
  const delimiter = delimiterOf(text)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quoted) {
      if (char !== '"') field += char
      else if (text[index + 1] === '"') {
        field += '"'
        index++
      } else quoted = false
    } else if (char === '"' && field === '') quoted = true
    else if (char === delimiter) {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += char
  }
  // A final line break ends the last record rather than starting an empty one.
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

// One column throughout is a list or prose that happens to be named .csv, better read as text.
export const isTabular = (rows: readonly (readonly string[])[]) => rows.some(row => row.length > 1)
