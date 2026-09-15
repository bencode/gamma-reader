import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoredFileMetadata } from '../../../core/files'
import { parseMarkdownHeadings } from './heading-model'
import { MarkdownReader } from './index'

vi.mock('../../../shell/workspace-context', () => ({ useReaderBinding: vi.fn() }))

const document: StoredFileMetadata = {
  id: 'guide',
  name: 'Guide.md',
  mediaType: 'text/markdown',
  previewKind: 'markdown',
  size: 100,
  lastModified: 1,
  createdAt: 1,
  revision: 1,
}

const renderReader = (content: string) =>
  render(
    <MarkdownReader
      document={document}
      content={content}
      files={[document]}
      active
      scrollPositions={{ current: new Map() }}
    />,
  )

describe('Markdown file reader', () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn()
    Range.prototype.getClientRects = () =>
      [new DOMRect(100, 100, 160, 24)] as unknown as DOMRectList
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0),
    )
    vi.stubGlobal('cancelAnimationFrame', (frame: number) => window.clearTimeout(frame))
  })

  it('extracts rendered headings without treating fenced code as an outline', () => {
    expect(
      parseMarkdownHeadings(
        `# **Introduction**\n\nDetails\n-------\n\n> ### Nested *topic*\n\n\`\`\`md\n# Example only\n\`\`\``,
      ),
    ).toEqual([
      { id: 'markdown-heading-1', title: 'Introduction', level: 1 },
      { id: 'markdown-heading-2', title: 'Details', level: 2 },
      { id: 'markdown-heading-3', title: 'Nested topic', level: 3 },
    ])
  })

  it('opens the outline and navigates rendered headings', async () => {
    const user = userEvent.setup()
    renderReader('# Introduction\n\n## Details\n\nBody')
    await user.click(screen.getByRole('button', { name: 'Show table of contents' }))
    expect(screen.getByRole('complementary', { name: 'Markdown contents' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Details' }))
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('omits the outline control when the document has no headings', () => {
    renderReader('A paragraph without headings.')

    expect(screen.queryByRole('button', { name: 'Show table of contents' })).not.toBeInTheDocument()
  })
})
