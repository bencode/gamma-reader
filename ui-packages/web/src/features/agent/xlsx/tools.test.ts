import { describe, expect, it } from 'vitest'
import type { SheetRow, Worksheet } from '../../../core/xlsx'
import type { XlsxRuntime } from './runtime'
import { createXlsxTools } from './tools'

const rowsOf = (count: number, cell: (row: number) => SheetRow): Worksheet['rows'] =>
  Array.from({ length: count }, (_, index) => cell(index + 1))

const call = async (sheets: Worksheet[], name: string, input: unknown) => {
  const runtime = { sheets: async () => sheets } as unknown as XlsxRuntime
  const tool = createXlsxTools(runtime).find(tool => tool.name === name)
  if (!tool) throw new Error(`No tool named ${name}`)
  const result = await tool.execute('call', input as never, undefined)
  return JSON.parse(result.content[0]?.type === 'text' ? result.content[0].text : '{}')
}

const workbook: Worksheet[] = [
  {
    name: '数据',
    rows: [
      ['项目', '人日'],
      ['询单', 3],
    ],
  },
  { name: '汇总', rows: [['合计', 3]] },
]

describe('sheet_info', () => {
  it('describes every sheet by the extent an agent can ask for', async () => {
    await expect(call(workbook, 'sheet_info', { fileId: 'f' })).resolves.toEqual({
      fileId: 'f',
      sheets: [
        { number: 1, name: '数据', rows: 2, columns: 2, extent: 'A1:B2' },
        { number: 2, name: '汇总', rows: 1, columns: 2, extent: 'A1:B1' },
      ],
    })
  })
})

describe('sheet_read', () => {
  it('takes a region in A1 notation and leads each row with its number', async () => {
    await expect(call(workbook, 'sheet_read', { fileId: 'f', range: 'A2:B2' })).resolves.toEqual({
      fileId: 'f',
      sheet: '数据',
      sheetNumber: 1,
      columns: ['A', 'B'],
      rows: [{ row: 2, cells: ['询单', '3'] }],
    })
  })

  it('finds a sheet by name or by number, and the first one by default', async () => {
    const byName = await call(workbook, 'sheet_read', { fileId: 'f', sheet: '汇总' })
    const byNumber = await call(workbook, 'sheet_read', { fileId: 'f', sheet: '2' })
    expect(byName).toEqual(byNumber)
    expect(byName.sheet).toBe('汇总')
    expect((await call(workbook, 'sheet_read', { fileId: 'f' })).sheet).toBe('数据')
  })

  it('refuses a range it cannot read rather than guessing one', async () => {
    await expect(call(workbook, 'sheet_read', { fileId: 'f', range: 'sheet1!A1' })).rejects.toThrow(
      /A1 notation/,
    )
    await expect(call(workbook, 'sheet_read', { fileId: 'f', sheet: 'nope' })).rejects.toThrow(
      /sheet_info/,
    )
  })

  it('stops at a row the agent can continue from', async () => {
    const long = [{ name: 'Long', rows: rowsOf(250, row => [`r${row}`]) }]
    const first = await call(long, 'sheet_read', { fileId: 'f' })
    expect(first.rows).toHaveLength(200)
    expect(first.nextRow).toBe(201)
    const rest = await call(long, 'sheet_read', { fileId: 'f', range: `A${first.nextRow}:A250` })
    expect(rest.rows.at(-1)).toEqual({ row: 250, cells: ['r250'] })
    expect(rest.nextRow).toBeUndefined()
  })

  it('returns fewer rows when the cells are too large for one result', async () => {
    const wide = [{ name: 'Wide', rows: rowsOf(200, row => ['x'.repeat(400), String(row)]) }]
    const result = await call(wide, 'sheet_read', { fileId: 'f' })
    expect(result.rows.length).toBeLessThan(200)
    expect(result.nextRow).toBe(result.rows.length + 1)
  })
})
