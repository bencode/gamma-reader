import { buildGraph, type LinkGraph } from '@gamma-reader/links'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoredFileMetadata } from '../../../core/files'
import { parseMarkdownHeadings } from './heading-model'
import { MarkdownReader } from './index'
import { StandardMarkdownReader } from './standard-reader'

const links = vi.hoisted(() => ({
  graph: null as LinkGraph | null,
  openLink: vi.fn(),
  reveal: null as { fileId: string; target: { block: string } } | null,
  shown: vi.fn(),
}))

vi.mock('../../../shell/workspace-context', () => ({
  useReaderBinding: vi.fn(),
  useLinkGraph: () => links.graph,
  useOpenLink: () => links.openLink,
  useReveal: () => ({ reveal: links.reveal, shown: links.shown }),
}))

const document: StoredFileMetadata = {
  id: 'guide',
  path: 'Guide.md',
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
      onPositionChange={() => undefined}
    />,
  )

describe('Markdown file reader', () => {
  beforeEach(() => {
    links.graph = null
    links.reveal = null
    links.openLink.mockReset()
    links.shown.mockReset()
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
    const user = userEvent.setup({ delay: null })
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
    const user = userEvent.setup({ delay: null })
    const props = {
      document,
      content: '# Guide\n\nRead at your own pace.',
      files: [document],
      active: true,
      onPositionChange: () => undefined,
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
        document={{ ...document, id: 'second', path: 'Second.md' }}
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

describe('links in a Markdown note', () => {
  const shared = (id: string, path: string): StoredFileMetadata => ({ ...document, id, path })
  const library = [document, shared('one', 'one/Shared.md'), shared('two', 'two/Shared.md')]

  beforeEach(() => {
    links.graph = buildGraph(library, new Map())
    links.reveal = null
    links.openLink.mockReset()
    links.shown.mockReset()
  })

  const renderNote = (content: string) =>
    render(
      <MarkdownReader
        document={document}
        content={content}
        files={library}
        active
        onPositionChange={() => undefined}
      />,
    )

  it('opens the note a link names, at the place it names, and hides names', async () => {
    const user = userEvent.setup({ delay: null })
    renderNote('See [[guide#^def|the definition]]. ^def')

    expect(screen.queryByText(/\^def/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'the definition' }))

    expect(links.openLink).toHaveBeenCalledWith({ page: 'guide', block: 'def' }, 'guide')
  })

  it('leaves a page with no note inert and offers the notes that share a name', async () => {
    const user = userEvent.setup({ delay: null })
    renderNote('[[Nowhere]] and [[Shared]]')

    await user.click(screen.getByRole('button', { name: 'Nowhere' }))
    expect(screen.getByRole('button', { name: 'Nowhere' })).toHaveAttribute(
      'title',
      'No note named Nowhere yet.',
    )
    expect(links.openLink).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Shared' }))
    await user.click(screen.getByRole('button', { name: 'two/Shared.md' }))
    expect(links.openLink).toHaveBeenCalledWith({ page: 'Shared' }, 'two')
  })

  it('shows the block a link asked for and says it was shown', () => {
    links.reveal = { fileId: 'guide', target: { block: 'def' } }
    renderNote('# Guide\n\nRetrieval first. ^def')

    expect(links.shown).toHaveBeenCalledWith(links.reveal)
  })
})
