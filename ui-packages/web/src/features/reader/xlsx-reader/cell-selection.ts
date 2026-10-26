import { cellText, type SheetCell } from '../../../formats/xlsx'

// Zero-based, as the grid indexes its rows and columns.
export type CellPosition = { row: number; column: number }

const steps = new Map([
  ['ArrowUp', { row: -1, column: 0 }],
  ['ArrowDown', { row: 1, column: 0 }],
  ['ArrowLeft', { row: 0, column: -1 }],
  ['ArrowRight', { row: 0, column: 1 }],
])

const clamp = (value: number, size: number) => Math.min(Math.max(value, 0), size - 1)

// The cell an arrow key leads to, held inside the sheet; the first key with nothing selected
// selects the top-left cell. Any other key moves nothing.
export const moveSelection = (
  position: CellPosition | null,
  key: string,
  rows: number,
  columns: number,
): CellPosition | null => {
  const step = steps.get(key)
  if (!step) return null
  if (!position) return { row: 0, column: 0 }
  return {
    row: clamp(position.row + step.row, rows),
    column: clamp(position.column + step.column, columns),
  }
}

// What the cell bar shows: text as written, with the line breaks the grid folds away.
export const cellDetail = (value: SheetCell) =>
  typeof value === 'string' ? value : cellText(value)
