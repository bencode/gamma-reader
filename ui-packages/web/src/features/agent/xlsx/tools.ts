import { Type } from '@earendil-works/pi-ai'
import {
  type CellRange,
  columnCount,
  parseRange,
  selectCells,
  sheetExtent,
  type Worksheet,
} from '../../../core/xlsx'
import { fitsResult } from '../pagination'
import { bind } from '../tool'
import { LocalToolError } from '../tool-types'
import type { XlsxRuntime } from './runtime'

// Enough rows to see a pattern, few enough that a wide sheet is not built only to be discarded.
const maximumRows = 200
const wholeSheet: CellRange = {
  startRow: 1,
  endRow: Number.MAX_SAFE_INTEGER,
  startColumn: 1,
  endColumn: Number.MAX_SAFE_INTEGER,
}

// A sheet named "2" is meant before the second sheet is.
const sheetNumber = (sheets: readonly Worksheet[], wanted?: string) => {
  if (wanted === undefined) return 1
  const named = sheets.findIndex(sheet => sheet.name === wanted)
  return named >= 0 ? named + 1 : Number(wanted)
}

const pickSheet = (sheets: readonly Worksheet[], wanted?: string) => {
  const number = sheetNumber(sheets, wanted)
  const sheet = Number.isInteger(number) ? sheets[number - 1] : undefined
  if (!sheet)
    throw new LocalToolError(`This workbook has no sheet "${wanted}". Use sheet_info to list them.`)
  return { number, sheet }
}

export const createXlsxTools = (xlsx: XlsxRuntime) => [
  bind(
    'sheet_info',
    'List the sheets of a spreadsheet with their size and A1 extent, without reading any cells. Use it to choose a sheet and a range before sheet_read.',
    Type.Object({ fileId: Type.String() }),
    async ({ fileId }, signal) => {
      const sheets = await xlsx.sheets(fileId, signal)
      return {
        fileId,
        sheets: sheets.map((sheet, index) => ({
          number: index + 1,
          name: sheet.name,
          rows: sheet.rows.length,
          columns: columnCount(sheet.rows),
          extent: sheetExtent(sheet),
        })),
      }
    },
  ),
  bind(
    'sheet_read',
    'Read cells from one sheet in A1 notation: "A1:F50" for a block, "A:F" for whole columns, "1:50" for whole rows, "B3" for one cell. Omit range to start at the top of the sheet, and omit sheet for the first one. Each row comes back as its row number and its cells, one cell per letter in columns, in that order. When nextRow is set, ask again from that row.',
    Type.Object({
      fileId: Type.String(),
      sheet: Type.Optional(Type.String()),
      range: Type.Optional(Type.String()),
    }),
    async ({ fileId, sheet: wanted, range: requested }, signal) => {
      const sheets = await xlsx.sheets(fileId, signal)
      if (!sheets.length) throw new LocalToolError('This workbook has no sheets.')
      const { number, sheet } = pickSheet(sheets, wanted)
      const range = requested === undefined ? wholeSheet : parseRange(requested)
      if (!range)
        throw new LocalToolError('Use A1 notation, such as "A1:F50", "A:F", "1:50" or "B3".')

      const lastRow = Math.min(sheet.rows.length, range.endRow)
      const selection = selectCells(sheet, {
        ...range,
        endRow: Math.min(range.endRow, range.startRow + maximumRows - 1),
      })
      const build = (count: number) => {
        const nextRow = selection.startRow + count
        return {
          fileId,
          sheet: sheet.name,
          sheetNumber: number,
          columns: selection.columns,
          // The row number is named rather than positional: a leading unnamed number invites
          // reading it as column A and shifting every letter after it.
          rows: selection.rows.slice(0, count).map((cells, index) => ({
            row: selection.startRow + index,
            cells,
          })),
          ...(nextRow <= lastRow ? { nextRow } : {}),
        }
      }
      let count = selection.rows.length
      while (count > 0 && !fitsResult(build(count))) count = Math.floor(count / 2)
      if (!count && selection.rows.length)
        throw new LocalToolError('A single row exceeds the result limit. Ask for fewer columns.')
      return build(count)
    },
  ),
]
