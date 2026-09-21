import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { StoredFileMetadata } from '../../../core/files'
import type { Worksheet } from '../../../core/xlsx'
import { XlsxReader } from './index'

vi.mock('../../../shell/workspace-context', () => ({ useReaderBinding: vi.fn() }))

const mocks = vi.hoisted(() => ({ read: vi.fn() }))
// Only the parse is stubbed, so adding an export to the module cannot break this file.
vi.mock('../../../core/xlsx', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../core/xlsx')>()),
  readSpreadsheet: mocks.read,
}))

const file: StoredFileMetadata = {
  id: 'effort',
  name: '人日评估.xlsx',
  mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  previewKind: 'xlsx',
  size: 12_000,
  lastModified: 1,
  createdAt: 1,
  revision: 1,
}

const show = (sheets: Worksheet[]) => {
  mocks.read.mockReset()
  mocks.read.mockResolvedValue(sheets)
  return render(
    <StrictMode>
      <XlsxReader
        document={file}
        blob={new Blob(['xlsx'])}
        active
        scrollPositions={{ current: new Map() }}
      />
    </StrictMode>,
  )
}

describe('spreadsheet reader', () => {
  it('shows cells against the column letters and row numbers a spreadsheet uses', async () => {
    show([
      {
        name: '数据',
        rows: [
          ['项目', '人日'],
          ['询单', 3],
        ],
      },
    ])
    expect(await screen.findByRole('columnheader', { name: 'A' })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: 'B' })).toBeVisible()
    const second = screen.getByRole('rowheader', { name: '2' }).closest('tr')
    expect(within(second as HTMLElement).getByText('询单')).toBeVisible()
    expect(within(second as HTMLElement).getByText('3')).toBeVisible()
    expect(mocks.read).toHaveBeenCalledTimes(1)
  })

  it('opens another sheet from its tab', async () => {
    const user = userEvent.setup({ delay: null })
    show([
      { name: '数据', rows: [['第一张表']] },
      { name: '汇总', rows: [['第二张表']] },
    ])
    expect(await screen.findByText('第一张表')).toBeVisible()
    await user.click(screen.getByRole('tab', { name: '汇总' }))
    expect(screen.getByText('第二张表')).toBeVisible()
    expect(screen.queryByText('第一张表')).not.toBeInTheDocument()
  })

  it('says how many columns it left out of a very wide sheet', async () => {
    show([{ name: 'Wide', rows: [Array.from({ length: 140 }, (_, index) => `c${index}`)] }])
    expect(await screen.findByText(/first 100 of 140 columns/)).toBeVisible()
  })

  it('shows an empty sheet as empty rather than failing', async () => {
    show([{ name: 'Sheet2', rows: [] }])
    expect(await screen.findByText('This sheet is empty.')).toBeVisible()
  })
})
