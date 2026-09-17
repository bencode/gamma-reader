import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoredFileMetadata } from '../../../core/files'
import { parseMarkdownHeadings } from './heading-model'
import { MarkdownReader } from './index'
import { StandardMarkdownReader } from './standard-reader'

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

  it('keeps reading preferences on ordinary Markdown without changing the base reader', async () => {
    const user = userEvent.setup()
    const props = {
      document,
      content: '# Guide\n\nRead at your own pace.',
      files: [document],
      active: true,
      scrollPositions: { current: new Map<string, number>() },
    }
    const base = render(<MarkdownReader {...props} />)
    expect(screen.queryByRole('button', { name: 'Reading appearance' })).not.toBeInTheDocument()
    base.unmount()

    const standard = render(<StandardMarkdownReader {...props} />)
    await user.click(screen.getByRole('button', { name: 'Reading appearance' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Text size' }), {
      target: { value: '18' },
    })
    await user.click(screen.getByRole('button', { name: 'Full width' }))
    await user.click(screen.getByRole('radio', { name: 'Paper' }))

    expect(screen.getByRole('article')).toHaveStyle({ fontSize: '18px', maxWidth: 'none' })
    expect(screen.getByRole('article')).toHaveAttribute('data-reading-width', 'full')
    expect(screen.getByRole('article').parentElement).toHaveAttribute('data-reading-theme', 'paper')
    expect(localStorage.getItem('gamma-reader.markdown-reading-preferences')).toBe(
      JSON.stringify({ fontSize: 18, width: 'full', theme: 'paper' }),
    )

    const second = render(
      <StandardMarkdownReader
        {...props}
        document={{ ...document, id: 'second', name: 'Second.md' }}
      />,
    )
    expect(screen.getAllByRole('article')[1]).toHaveStyle({ fontSize: '18px', maxWidth: 'none' })
    expect(screen.getAllByRole('article')[1]?.parentElement).toHaveAttribute(
      'data-reading-theme',
      'paper',
    )
    second.unmount()
    standard.unmount()

    render(<StandardMarkdownReader {...props} />)
    expect(screen.getByRole('article')).toHaveStyle({ fontSize: '18px', maxWidth: 'none' })
    expect(screen.getByRole('article').parentElement).toHaveAttribute('data-reading-theme', 'paper')
  })
})
