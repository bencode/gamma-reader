import { buildGraph, type LinkGraph, type ParsedNote, parseNote } from '@gamma-reader/links'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoredFileMetadata } from '../../../core/files'
import { parseMarkdownHeadings } from './heading-model'
import { MarkdownReader } from './index'
import { StandardMarkdownReader } from './standard-reader'

const links = vi.hoisted(() => ({
  graph: null as LinkGraph | null,
  openFile: vi.fn(),
  openPage: vi.fn(),
  saved: {} as Record<string, string>,
  reveal: null as { fileId: string; target: { block: string } } | null,
  shown: vi.fn(),
}))

vi.mock('../../../shell/workspace-context', () => ({
  useReaderBinding: vi.fn(),
  useLinkGraph: () => links.graph,
  useOpenFile: () => links.openFile,
  useOpenPage: () => links.openPage,
  useReveal: () => ({ reveal: links.reveal, shown: links.shown }),

  useTextFileUpdates: () => ({ update: vi.fn(), unsaved: () => false }),
}))

// Embeds read a note's saved text by its id.
vi.mock('../../../data/file-store', () => ({
  getStoredFileContent: async (id: string) =>
    id in links.saved ? new Blob([links.saved[id] as string]) : null,
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
    links.openFile.mockReset()
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
    links.openFile.mockReset()
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

    expect(links.openFile).toHaveBeenCalledWith('guide', { block: 'def' })
  })

  it('opens a page no note holds as a page, and offers the notes that share a name', async () => {
    const user = userEvent.setup({ delay: null })
    links.openPage.mockReset()
    renderNote('[[Nowhere]] and [[Shared]]')

    await user.click(screen.getByRole('button', { name: 'Nowhere' }))
    expect(screen.getByRole('button', { name: 'Nowhere' })).toHaveAttribute(
      'title',
      'No note named Nowhere yet. Open its page.',
    )
    expect(links.openPage).toHaveBeenCalledWith('Nowhere')
    expect(links.openFile).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Shared' }))
    await user.click(screen.getByRole('button', { name: 'two/Shared.md' }))
    expect(links.openFile).toHaveBeenCalledWith('two', null)
  })

  it('shows the block a link asked for and says it was shown', () => {
    links.reveal = { fileId: 'guide', target: { block: 'def' } }
    renderNote('# Guide\n\nRetrieval first. ^def')

    expect(links.shown).toHaveBeenCalledWith(links.reveal)
  })
})

describe('embeds and backlinks in a Markdown note', () => {
  const note = (id: string, path: string): StoredFileMetadata => ({ ...document, id, path })
  const library = [document, note('rag', 'knowledge/RAG.md'), note('plan', 'Plan.md')]
  const library2 = [...library, note('a', 'A.md'), note('b', 'B.md')]

  // The library's saved notes, indexed as the reader's index would have them.
  const save = (texts: Record<string, string>, files = library2) => {
    links.saved = texts
    links.graph = buildGraph(
      files,
      new Map<string, ParsedNote>(Object.entries(texts).map(([id, text]) => [id, parseNote(text)])),
    )
  }

  beforeEach(() => {
    links.reveal = null
    links.openFile.mockReset()
    links.shown.mockReset()
  })

  const renderNote = (content: string, files = library2) =>
    render(
      <MarkdownReader
        document={document}
        content={content}
        files={files}
        active
        onPositionChange={() => undefined}
      />,
    )

  const rag = '# RAG\n\nRetrieval first. ^def\n\n## Methods\n\n- BM25\n- Dense'

  it('shows a whole note, a block or a section in place, and a missing block as missing', async () => {
    save({ rag, plan: '---\nname: Plan\n---\nThe plan body.' })
    renderNote('![[RAG#^def]]\n\n![[RAG#Methods]]\n\n![[Plan]]\n\n![[RAG#^gone]]')

    expect(await screen.findByText('Retrieval first.')).toBeInTheDocument()
    expect(await screen.findByText('Dense')).toBeInTheDocument()
    expect(await screen.findByText('The plan body.')).toBeInTheDocument()
    expect(screen.queryByText(/name: Plan/)).not.toBeInTheDocument()
    expect(await screen.findByText('RAG#^gone has no ^gone.')).toBeInTheDocument()
  })

  it('reads an embedded note again when it is saved anew', async () => {
    save({ rag: 'Before saving.' })
    const page = renderNote('![[RAG]]')
    expect(await screen.findByText('Before saving.')).toBeInTheDocument()

    save({ rag: 'After saving.' })
    const saved = library2.map(file => (file.id === 'rag' ? { ...file, revision: 2 } : file))
    page.rerender(
      <MarkdownReader
        document={document}
        content="![[RAG]]"
        files={saved}
        active
        onPositionChange={() => undefined}
      />,
    )
    // What was shown stays until the new text replaces it.
    expect(screen.getByText('Before saving.')).toBeInTheDocument()
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
    expect(await screen.findByText('After saving.')).toBeInTheDocument()
  })

  it('shows a whole note without a first heading that only repeats its name', async () => {
    save({ rag })
    renderNote('![[RAG]]\n\n![[RAG#Methods]]')

    expect(await screen.findAllByText('Dense')).toHaveLength(2)
    expect(screen.queryByRole('heading', { name: 'RAG' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('heading', { name: 'Methods' })).toHaveLength(2)
  })

  it('drops a repeated title written with an underline, underline and all', async () => {
    save({ rag: 'RAG\n===\n\nUnder the title.' })
    renderNote('![[RAG]]')

    expect(await screen.findByText('Under the title.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'RAG' })).not.toBeInTheDocument()
    expect(screen.queryByText('===')).not.toBeInTheDocument()
  })

  it('names a note already shown around an embed instead of showing it again', async () => {
    const user = userEvent.setup({ delay: null })
    save({ guide: '![[Guide]]', a: 'In A.\n\n![[B]]', b: 'In B.\n\n![[A]]' })
    renderNote('![[Guide]]\n\n![[A]]')

    expect(screen.getByText(/Circular embed: Guide/)).toBeInTheDocument()
    expect(await screen.findByText('In A.')).toBeInTheDocument()
    // An embed inside an embed waits to be opened.
    expect(screen.queryByText('In B.')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Expand' }))
    expect(await screen.findByText('In B.')).toBeInTheDocument()
    expect(screen.getByText(/Circular embed: A/)).toBeInTheDocument()
  })

  it('keeps the outline to the note’s own headings', async () => {
    const user = userEvent.setup({ delay: null })
    save({ rag })
    renderNote('# Guide\n\n![[RAG]]\n\n## After')

    await screen.findByText('Retrieval first.')
    await user.click(screen.getByRole('button', { name: 'Show table of contents' }))
    const outline = screen.getByRole('complementary', { name: 'Markdown contents' })
    expect(
      within(outline)
        .getAllByRole('button')
        .map(button => button.textContent),
    ).toEqual(expect.arrayContaining(['Guide', 'After']))
    expect(within(outline).queryByText('Methods')).not.toBeInTheDocument()
  })

  it('runs a sketch and an HTML page in place, in sandboxes, at the size written', async () => {
    const files = [
      ...library2,
      { ...note('orbit', 'sketches/orbit.p5.js'), previewKind: 'text' as const },
      { ...note('demo', 'demo.html'), previewKind: 'html' as const },
    ]
    save({ orbit: 'function setup() { createCanvas(720, 480) }', demo: '<p>Hello</p>' }, files)
    renderNote('![[orbit.p5.js|640]]\n\n![[demo.html|Demo|800x500]]', files)

    const sketch = await screen.findByTitle('sketches/orbit.p5.js p5 preview')
    expect(sketch).toHaveAttribute('sandbox', 'allow-scripts')
    expect(sketch.getAttribute('srcdoc')).toContain('createCanvas(720, 480)')
    expect(sketch.closest('[style]')).toHaveStyle({ width: '640px' })
    const page = await waitFor(() => {
      const frame = window.document.querySelector('iframe[title="demo.html"]')
      expect(frame).toHaveAttribute('sandbox', 'allow-scripts')
      return frame
    })
    expect(page?.closest('[style]')).toHaveStyle({ width: '800px', height: '500px' })
    expect(screen.getByRole('button', { name: 'Demo ›' })).toBeInTheDocument()
  })

  it('keeps a link it cannot show in its paragraph, and an embed with a name findable', () => {
    links.reveal = { fileId: 'guide', target: { block: 'ref' } }
    save({ rag })
    renderNote('Before.\n\n![[Nowhere]]\n\n![[RAG]] ^ref')

    expect(screen.getByRole('button', { name: 'Nowhere' }).parentElement?.tagName).toBe('P')
    expect(window.document.querySelector('[data-block="ref"]')).toHaveAttribute('data-embed', 'RAG')
    expect(links.shown).toHaveBeenCalledWith(links.reveal)
  })

  it('lists a line that links here twice once', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    save({ rag: 'See [[Guide]] and [[Guide#Setup]].' })
    renderNote('# Guide')

    expect(screen.getByText('2 links to this note')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'See Guide and Guide#Setup.' })).toHaveLength(1)
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('reads a line that links here as text, with the links that lead here standing out', () => {
    save({ rag: '- Block: [[Guide#^def|the definition]] and [[Other]] ^b' })
    renderNote('# Guide')

    const entry = screen.getByRole('button', { name: 'Block: the definition and Other' })
    expect([...entry.querySelectorAll('strong')].map(strong => strong.textContent)).toEqual([
      'the definition',
    ])
  })

  it('lists the notes that link here, each line leading to where it stands', async () => {
    const user = userEvent.setup({ delay: null })
    const hub = note('hub', 'Hub.md')
    save(
      {
        guide: 'See [[Guide]] here.',
        rag: '# RAG\n\n- Per [[Guide]] first ^per',
        plan: '# Plan\n\n## Steps\n\nFollow [[guide#Setup]].',
        hub: Array.from({ length: 60 }, (_, i) => `- [[Guide]] ${i}`).join('\n'),
      },
      [...library, hub],
    )
    renderNote('See [[Guide]] here.', [...library, hub])

    expect(screen.getByText('62 links to this note')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Per Guide first' }))
    expect(links.openFile).toHaveBeenCalledWith('rag', { block: 'per' })
    await user.click(screen.getByRole('button', { name: 'Follow guide#Setup.' }))
    expect(links.openFile).toHaveBeenCalledWith('plan', { heading: 'steps' })
    expect(screen.queryByRole('button', { name: 'Guide 59' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show 12 more' }))
    expect(screen.getByRole('button', { name: 'Guide 59' })).toBeInTheDocument()
  })
})
