import { describe, expect, it, vi } from 'vitest'
import { cellText, clampColumns, columnLabel, readSpreadsheet, sheetText } from './xlsx'

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
    expect(cellText(new Date('2026-04-01T00:00:00Z'))).toBe('2026-04-01')
    expect(cellText(new Date('2026-04-01T09:30:00Z'))).toBe('2026-04-01 09:30:00')
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
