import { render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { DocxConversion } from '../../core/docx'
import type { StoredFileMetadata } from '../../core/files'
import { DocxReader } from './docx-reader'

vi.mock('../../shell/workspace-context', () => ({ useReaderBinding: vi.fn() }))

const mocks = vi.hoisted(() => ({ convert: vi.fn() }))
// Only the conversion is stubbed, so adding an export to the module cannot break this file.
vi.mock('../../core/docx', async importOriginal => ({
  ...(await importOriginal<typeof import('../../core/docx')>()),
  convertDocxToMarkdown: mocks.convert,
}))

const converts = (conversion: Partial<DocxConversion>) => {
  mocks.convert.mockReset()
  mocks.convert.mockResolvedValue({
    markdown: '',
    images: new Map(),
    messages: [],
    ...conversion,
  })
}

const file: StoredFileMetadata = {
  id: 'report',
  name: '季度报告.docx',
  mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  previewKind: 'docx',
  size: 2048,
  lastModified: 1,
  createdAt: 1,
  revision: 1,
}

// StrictMode runs effects twice; a conversion guard set too early leaves the reader loading forever.
const renderReader = () =>
  render(
    <StrictMode>
      <DocxReader
        document={file}
        blob={new Blob(['docx bytes'])}
        files={[file]}
        active
        scrollPositions={{ current: new Map() }}
      />
    </StrictMode>,
  )

describe('Word reader', () => {
  it('renders the converted document once under StrictMode', async () => {
    converts({ markdown: '# 季度报告\n\n营收增长了两成。' })
    renderReader()
    expect(await screen.findByRole('heading', { name: '季度报告' })).toBeInTheDocument()
    expect(mocks.convert).toHaveBeenCalledTimes(1)
  })

  it('resolves embedded images from the conversion rather than the workspace', async () => {
    converts({
      markdown: '![示意图](docx-image-1)',
      images: new Map([['docx-image-1', new Blob(['png'], { type: 'image/png' })]]),
    })
    renderReader()
    expect(await screen.findByRole('img', { name: '示意图' })).toHaveAttribute(
      'src',
      'blob:gamma-reader-preview',
    )
  })
})
