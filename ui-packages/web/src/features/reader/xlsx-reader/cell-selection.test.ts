import { expect, it } from 'vitest'
import { cellDetail, moveSelection } from './cell-selection'

it('moves the selection by arrow key and stops at the edges of the sheet', () => {
  const at = { row: 0, column: 0 }
  expect(moveSelection(null, 'ArrowDown', 3, 2)).toEqual(at)
  expect(moveSelection(at, 'ArrowRight', 3, 2)).toEqual({ row: 0, column: 1 })
  expect(moveSelection(at, 'ArrowUp', 3, 2)).toEqual(at)
  expect(moveSelection(at, 'ArrowLeft', 3, 2)).toEqual(at)
  expect(moveSelection({ row: 2, column: 1 }, 'ArrowDown', 3, 2)).toEqual({ row: 2, column: 1 })
  expect(moveSelection(at, 'Enter', 3, 2)).toBeNull()
})

it("keeps a cell's own line breaks, which the grid folds into one line", () => {
  expect(cellDetail('第一行\n第二行')).toBe('第一行\n第二行')
  expect(cellDetail(true)).toBe('TRUE')
  expect(cellDetail(null)).toBe('')
})
