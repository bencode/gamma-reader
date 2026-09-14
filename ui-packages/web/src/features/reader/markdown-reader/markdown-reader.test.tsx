import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Activity } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoredFileMetadata } from '../../../core/files'
import { TextFileReader } from '../text-file-reader'
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
      markdown
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

  it('opens the outline and switches to a lazy, read-only source view', async () => {
    const user = userEvent.setup()
    renderReader('# Introduction\n\n## Details\n\nBody')

    await user.click(screen.getByRole('button', { name: 'Show table of contents' }))
    expect(screen.getByRole('complementary', { name: 'Markdown contents' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Source' }))
    expect(
      screen.queryByRole('complementary', { name: 'Markdown contents' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show table of contents' })).toBeDisabled()

    const source = await screen.findByLabelText('Guide.md source')
    expect(source).toHaveAttribute('contenteditable', 'false')
    expect(source).toHaveTextContent('# Introduction')

    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.getByRole('button', { name: 'Show table of contents' })).toBeEnabled()
  })

  it('omits the outline control when the document has no headings', () => {
    renderReader('A paragraph without headings.')

    expect(screen.queryByRole('button', { name: 'Show table of contents' })).not.toBeInTheDocument()
  })

  it('keeps the selected view when Activity hides and restores the file', async () => {
    const user = userEvent.setup()
    const blob = new Blob(['# Persistent source'], { type: 'text/markdown' })
    const props = {
      document,
      files: [document],
      blob,
      active: true,
      scrollPositions: { current: new Map<string, number>() },
    }
    const view = render(
      <Activity mode="visible">
        <TextFileReader {...props} />
      </Activity>,
    )

    await user.click(await screen.findByRole('button', { name: 'Source' }))
    expect(await screen.findByLabelText('Guide.md source')).toBeInTheDocument()

    view.rerender(
      <Activity mode="hidden">
        <TextFileReader {...props} active={false} />
      </Activity>,
    )
    view.rerender(
      <Activity mode="visible">
        <TextFileReader
          {...props}
          blob={new Blob(['# Persistent source'], { type: 'text/markdown' })}
        />
      </Activity>,
    )

    expect(await screen.findByLabelText('Guide.md source')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Source' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('restarts decoding when Activity interrupts an unfinished file read', async () => {
    const content = new TextEncoder().encode('# Restored reader').buffer
    let finishFirstRead: (value: ArrayBuffer) => void = () => undefined
    const firstRead = new Promise<ArrayBuffer>(resolve => {
      finishFirstRead = resolve
    })
    const arrayBuffer = vi.fn().mockReturnValueOnce(firstRead).mockResolvedValue(content)
    const blob = { arrayBuffer } as unknown as Blob
    const props = {
      document,
      files: [document],
      blob,
      active: true,
      scrollPositions: { current: new Map<string, number>() },
    }
    const view = render(
      <Activity mode="visible">
        <TextFileReader {...props} />
      </Activity>,
    )

    view.rerender(
      <Activity mode="hidden">
        <TextFileReader {...props} active={false} />
      </Activity>,
    )
    await act(() => finishFirstRead(content))
    view.rerender(
      <Activity mode="visible">
        <TextFileReader {...props} />
      </Activity>,
    )

    expect(await screen.findByRole('heading', { name: 'Restored reader' })).toBeInTheDocument()
    expect(arrayBuffer).toHaveBeenCalledTimes(2)
  })
})
