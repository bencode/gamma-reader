export type SheetCell = string | number | boolean | Date | null
export type SheetRow = readonly SheetCell[]
export type Worksheet = { name: string; rows: readonly SheetRow[] }

// A wide sheet is rare — nine in ten stay under 35 columns — and rendering hundreds of them
// costs far more than it shows. The agent still reads every column.
const maximumPreviewColumns = 100

export const columnLabel = (index: number): string => {
  const letter = String.fromCharCode(65 + (index % 26))
  return index < 26 ? letter : columnLabel(Math.floor(index / 26) - 1) + letter
}

// The inverse of columnLabel, one-based the way a spreadsheet counts: A is 1, AA is 27.
export const columnNumber = (letters: string) =>
  [...letters.toUpperCase()].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0)

// Rows and columns are both one-based here, matching the coordinates the preview shows.
export type CellRange = {
  startRow: number
  endRow: number
  startColumn: number
  endColumn: number
}

const reference = (text: string) => {
  const match = /^([a-z]+)?([0-9]+)?$/i.exec(text.trim())
  if (!match || (!match[1] && !match[2])) return null
  return {
    column: match[1] ? columnNumber(match[1]) : null,
    row: match[2] ? Number(match[2]) : null,
  }
}

// A1 notation, the language the sheet itself uses: 'A1:F50', a whole band of columns 'A:F',
// a band of rows '1:50', or one cell 'B3'. An open side reaches the edge of the sheet.
export const parseRange = (text: string): CellRange | null => {
  const parts = text.trim().split(':')
  if (parts.length > 2 || !parts[0]) return null
  const start = reference(parts[0])
  const end = reference(parts[1] ?? parts[0])
  if (!start || !end) return null
  const rows = [start.row ?? 1, end.row ?? Number.MAX_SAFE_INTEGER]
  const columns = [start.column ?? 1, end.column ?? Number.MAX_SAFE_INTEGER]
  return {
    startRow: Math.min(...rows),
    endRow: Math.max(...rows),
    startColumn: Math.min(...columns),
    endColumn: Math.max(...columns),
  }
}

export const columnCount = (rows: readonly SheetRow[]) =>
  rows.reduce((widest, row) => Math.max(widest, row.length), 0)

// Only the count is clamped: copying the rows of a ten thousand row sheet to hide columns
// would cost more than rendering them.
export const clampColumns = (rows: readonly SheetRow[]) => {
  const columns = columnCount(rows)
  const visible = Math.min(columns, maximumPreviewColumns)
  return { columns: visible, hidden: columns - visible }
}

// A date cell stores a day count, which the parser turns into midnight UTC, so a pure date
// reads back exactly there. Reading these through local time would append an invented time
// and, east of Greenwich, move the day.
const dateText = (value: Date) => {
  const iso = value.toISOString()
  return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.slice(0, 19).replace('T', ' ')
}

// Tabs and newlines inside a cell would break both the row layout and the agent's tab-separated
// view of it, and the preview keeps every cell on one line anyway.
export const cellText = (value: SheetCell): string => {
  if (value === null) return ''
  if (value instanceof Date) return dateText(value)
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  return String(value).replace(/\s+/gu, ' ').trim()
}

// Column letters and row numbers match what the preview shows, so a question about "B3"
// means the same cell to the reader and to the agent.
export const sheetText = (sheet: Worksheet) => {
  const columns = columnCount(sheet.rows)
  const heading = `# ${sheet.name} (${sheet.rows.length} rows × ${columns} columns)`
  if (!columns) return `${heading}\n\n(empty sheet)`
  const letters = ['', ...Array.from({ length: columns }, (_, index) => columnLabel(index))]
  const body = sheet.rows.map((row, index) =>
    [
      index + 1,
      ...Array.from({ length: columns }, (_, column) => cellText(row[column] ?? null)),
    ].join('\t'),
  )
  return [heading, letters.join('\t'), ...body].join('\n')
}

export const sheetExtent = (sheet: Worksheet) => {
  const columns = columnCount(sheet.rows)
  return columns && sheet.rows.length ? `A1:${columnLabel(columns - 1)}${sheet.rows.length}` : null
}

type CellSelection = {
  columns: readonly string[]
  rows: readonly (readonly string[])[]
  startRow: number
  endRow: number
}

// A request may reach past the sheet; the answer is what the sheet actually holds.
export const selectCells = (sheet: Worksheet, range: CellRange): CellSelection => {
  const startColumn = Math.max(1, range.startColumn)
  const endColumn = Math.min(columnCount(sheet.rows), range.endColumn)
  const startRow = Math.max(1, range.startRow)
  const endRow = Math.min(sheet.rows.length, range.endRow)
  const columns = Array.from({ length: Math.max(0, endColumn - startColumn + 1) }, (_, index) =>
    columnLabel(startColumn - 1 + index),
  )
  const rows = sheet.rows
    .slice(startRow - 1, endRow)
    .map(row => columns.map((_, index) => cellText(row[startColumn - 1 + index] ?? null)))
  return { columns, rows, startRow, endRow: startRow + rows.length - 1 }
}

// The line-addressable view of the whole workbook, used by the generic read and search tools.
export const workbookText = (sheets: readonly Worksheet[]) => sheets.map(sheetText).join('\n\n')

export const readSpreadsheet = async (blob: Blob): Promise<Worksheet[]> => {
  const { default: readXlsxFile } = await import('read-excel-file/browser')
  const sheets = await readXlsxFile(blob)
  return sheets.map(sheet => ({ name: sheet.sheet, rows: sheet.data as SheetRow[] }))
}
