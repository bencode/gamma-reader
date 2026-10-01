import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { StoredFileMetadata } from '../../core/files'
import { CsvReader } from './csv-reader'

vi.mock('../../shell/workspace-context', () => ({ useReaderBinding: vi.fn() }))

const file: StoredFileMetadata = {
  id: 'sightings',
  path: 'sightings.csv',
  mediaType: 'text/csv',
  previewKind: 'text',
  size: 64,
  lastModified: 1,
  createdAt: 1,
  revision: 1,
}

const show = (content: string) =>
  render(
    <CsvReader
      document={file}
      content={content}
      files={[file]}
      active
      onPositionChange={() => undefined}
    />,
  )

describe('csv reader', () => {
  it('lays the records out in the spreadsheet grid', () => {
    show('species,count,note\nWren,3,"sang ""early"", twice"\n')
    expect(screen.getByRole('columnheader', { name: 'C' })).toBeVisible()
    const second = screen.getByRole('rowheader', { name: '2' }).closest('tr')
    expect(within(second as HTMLElement).getByText('Wren')).toBeVisible()
    expect(within(second as HTMLElement).getByText('sang "early", twice')).toBeVisible()
  })

  it('shows a file with a single column as text', () => {
    show('first line\nsecond line\n')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText(/first line\s+second line/)).toBeVisible()
  })
})
