import { describe, expect, it, vi } from 'vitest'
import {
  cellText,
  clampColumns,
  columnLabel,
  columnNumber,
  parseRange,
  readSpreadsheet,
  selectCells,
  sheetExtent,
  sheetText,
  workbookText,
} from './xlsx'

const mocks = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('read-excel-file/browser', () => ({ default: mocks.read }))

describe('spreadsheet cells', () => {
  it('labels columns the way a spreadsheet does, past the first alphabet', () => {
    expect([0, 25, 26, 27, 51, 52].map(columnLabel)).toEqual(['A', 'Z', 'AA', 'AB', 'AZ', 'BA'])
    // The widest sheet measured carries 469 columns.
    expect(columnLabel(468)).toBe('RA')
  })

  it('renders each value the way the sheet meant it', () => {
    expect(cellText(null)).toBe('')
    expect(cellText(0)).toBe('0')
    expect(cellText(true)).toBe('TRUE')
    // Serial 46085 in a real sheet is the plain date 2026-03-04, and the parser puts it at
    // midnight UTC; a date must therefore read the same whatever zone the reader is in.
    expect(cellText(new Date('2026-03-04T00:00:00Z'))).toBe('2026-03-04')
    expect(cellText(new Date('2026-03-04T09:30:00Z'))).toBe('2026-03-04 09:30:00')
    // A cell holding several lines would otherwise break the row apart.
    expect(cellText('第一行\n第二行\t尾')).toBe('第一行 第二行 尾')
  })
})

describe('sheet text', () => {
  it('gives the agent the same coordinates the reader shows', () => {
    const text = sheetText({
      name: '数据',
      rows: [
        ['项目', '人日'],
        ['A', 3],
      ],
    })
    expect(text).toBe('# 数据 (2 rows × 2 columns)\n\tA\tB\n1\t项目\t人日\n2\tA\t3')
  })

  it('pads a ragged row so every line has the same columns', () => {
    const text = sheetText({ name: 'S', rows: [['a', 'b', 'c'], ['d']] })
    expect(text.split('\n').at(-1)).toBe('2\td\t\t')
  })

  it('says a sheet is empty rather than emitting a bare heading', () => {
    expect(sheetText({ name: 'Sheet2', rows: [] })).toBe(
      '# Sheet2 (0 rows × 0 columns)\n\n(empty sheet)',
    )
  })
})

describe('preview columns', () => {
  it('reports what the preview has to leave out', () => {
    expect(clampColumns([['a', 'b']])).toEqual({ columns: 2, hidden: 0 })
    const wide = [Array.from({ length: 469 }, () => 'x')]
    expect(clampColumns(wide)).toEqual({ columns: 100, hidden: 369 })
  })
})

describe('reading a workbook', () => {
  it('names each sheet from the workbook', async () => {
    mocks.read.mockResolvedValue([
      { sheet: '数据', data: [['a']] },
      { sheet: 'Sheet2', data: [] },
    ])
    const blob = new Blob(['xlsx'])
    await expect(readSpreadsheet(blob)).resolves.toEqual([
      { name: '数据', rows: [['a']] },
      { name: 'Sheet2', rows: [] },
    ])
    expect(mocks.read).toHaveBeenCalledWith(blob)
  })
})

describe('A1 notation', () => {
  it('round-trips a column between its letters and its number', () => {
    for (const letters of ['A', 'Z', 'AA', 'CV', 'RA'])
      expect(columnLabel(columnNumber(letters) - 1)).toBe(letters)
  })

  it('reads every shape a spreadsheet uses to name a region', () => {
    expect(parseRange('A1:F50')).toEqual({ startRow: 1, endRow: 50, startColumn: 1, endColumn: 6 })
    expect(parseRange('B3')).toEqual({ startRow: 3, endRow: 3, startColumn: 2, endColumn: 2 })
    // An open side reaches the edge of the sheet.
    expect(parseRange('A:F')).toMatchObject({ startRow: 1, startColumn: 1, endColumn: 6 })
    expect(parseRange('A:F')?.endRow).toBe(Number.MAX_SAFE_INTEGER)
    expect(parseRange('1:50')).toMatchObject({ startRow: 1, endRow: 50, startColumn: 1 })
    expect(parseRange('1:50')?.endColumn).toBe(Number.MAX_SAFE_INTEGER)
    expect(parseRange('f50:a1')).toEqual(parseRange('A1:F50'))
  })

  it('refuses what is not a reference rather than guessing', () => {
    for (const text of ['', ':', 'A1:B2:C3', 'sheet1!A1', '?']) expect(parseRange(text)).toBeNull()
  })
})

describe('selecting cells', () => {
  const sheet = {
    name: 'S',
    rows: [
      ['a', 'b', 'c'],
      [1, 2, 3],
      ['x', 'y', 'z'],
    ],
  }

  it('returns the region with the column letters it sits under', () => {
    expect(selectCells(sheet, parseRange('B2:C3') as never)).toEqual({
      columns: ['B', 'C'],
      rows: [
        ['2', '3'],
        ['y', 'z'],
      ],
      startRow: 2,
      endRow: 3,
    })
  })

  it('answers with what the sheet holds when the request reaches past it', () => {
    const selection = selectCells(sheet, parseRange('A1:ZZ9999') as never)
    expect(selection.columns).toEqual(['A', 'B', 'C'])
    expect(selection.endRow).toBe(3)
  })

  it('describes a sheet by the extent an agent can ask for', () => {
    expect(sheetExtent(sheet)).toBe('A1:C3')
    expect(sheetExtent({ name: 'empty', rows: [] })).toBeNull()
  })
})

describe('workbook text', () => {
  it('separates sheets so line numbers stay continuous across them', () => {
    const text = workbookText([
      { name: 'One', rows: [['a']] },
      { name: 'Two', rows: [['b']] },
    ])
    expect(text.split('\n')).toEqual([
      '# One (1 rows × 1 columns)',
      '\tA',
      '1\ta',
      '',
      '# Two (1 rows × 1 columns)',
      '\tA',
      '1\tb',
    ])
  })
})
