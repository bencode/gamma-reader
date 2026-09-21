export type SheetCell = string | number | boolean | Date | null
export type SheetRow = readonly SheetCell[]
export type Worksheet = { name: string; rows: readonly SheetRow[] }

// A wide sheet is rare — nine in ten stay under 35 columns — and rendering hundreds of them
// costs far more than it shows. The agent still reads every column.
export const maximumPreviewColumns = 100

export const columnLabel = (index: number): string => {
  const letter = String.fromCharCode(65 + (index % 26))
  return index < 26 ? letter : columnLabel(Math.floor(index / 26) - 1) + letter
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

export const readSpreadsheet = async (blob: Blob): Promise<Worksheet[]> => {
  const { default: readXlsxFile } = await import('read-excel-file/browser')
  const sheets = await readXlsxFile(blob)
  return sheets.map(sheet => ({ name: sheet.sheet, rows: sheet.data as SheetRow[] }))
}
