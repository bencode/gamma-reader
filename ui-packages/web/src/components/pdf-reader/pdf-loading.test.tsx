import { act, fireEvent, render, screen } from '@testing-library/react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { type ReactNode, Suspense, use, useEffect, useLayoutEffect, useState } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { PdfReader, type PdfReadingTheme } from './index'

const loading = vi.hoisted(() => ({
  page: Promise.resolve(),
  pageFailure: undefined as 'load' | 'render' | undefined,
  options: undefined as { wasmUrl: string } | undefined,
  pageColors: undefined as { background: string; foreground: string } | undefined,
}))

beforeEach(() => {
  loading.page = Promise.resolve()
  loading.pageFailure = undefined
  loading.options = undefined
  loading.pageColors = undefined
})
const pdf = {
  numPages: 3,
  loadingTask: { destroyed: false },
  getOutline: async () => [
    { title: 'First', dest: [0], items: [] },
    { title: 'Second', dest: [1], items: [] },
  ],
} as unknown as PDFDocumentProxy

vi.mock('react-pdf', () => ({
  pdfjs: { GlobalWorkerOptions: {} },
  Document: ({
    children,
    file,
    options,
    onLoadSuccess,
  }: {
    children: ReactNode
    file: string
    options: { wasmUrl: string }
    onLoadSuccess: (document: PDFDocumentProxy) => void
  }) => {
    loading.options = options
    useLayoutEffect(() => {
      if (file === 'blob:broken') throw new Error('Invalid PDF structure')
    }, [file])
    useEffect(() => onLoadSuccess(pdf), [onLoadSuccess])
    return children
  },
  Page: ({
    pageNumber,
    pageColors,
  }: {
    pageNumber: number
    pageColors?: { background: string; foreground: string }
  }) => {
    loading.pageColors = pageColors
    useLayoutEffect(() => {
      if (pageNumber === 2 && loading.pageFailure === 'render')
        throw new Error('Page rendering failed')
    }, [pageNumber])
    if (pageNumber === 2 && loading.pageFailure === 'load') throw new Error('Page loading failed')
    if (pageNumber > 1) use(loading.page)
    return <div>Page content {pageNumber}</div>
  },
}))

const Reader = ({ source = 'blob:sample' }: { source?: string }) => {
  const [page, setPage] = useState(1)
  const [theme, setTheme] = useState<PdfReadingTheme>('original')
  return (
    <Suspense fallback={<div>Preparing PDF preview</div>}>
      <PdfReader
        source={source}
        name="Sample.pdf"
        pageNumber={page}
        theme={theme}
        onPageChange={setPage}
        onThemeChange={setTheme}
      />
    </Suspense>
  )
}

it('provides the local PDF.js WASM directory to the document', async () => {
  render(<Reader />)

  expect(await screen.findByText('Page content 1')).toBeVisible()
  expect(loading.options).toEqual({ wasmUrl: '/wasm/' })
})

it('recolors the rendered page when the reading theme changes', async () => {
  render(<Reader />)
  expect(await screen.findByText('Page content 1')).toBeVisible()
  expect(loading.pageColors).toBeUndefined()

  fireEvent.click(screen.getByRole('button', { name: 'Reading appearance' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Paper' }))

  expect(loading.pageColors).toEqual({ background: '#f3ead2', foreground: '#302b26' })
})

it.each(['next', 'slider', 'outline'])(
  'keeps controls and outline mounted and focused while %s navigation loads a page',
  async navigation => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000)
    let resolvePage: (() => void) | undefined
    loading.page = new Promise<void>(resolve => {
      resolvePage = resolve
    })
    render(<Reader />)
    const toggle = await screen.findByRole('button', { name: 'Show table of contents' })
    fireEvent.click(toggle)
    const outline = screen.getByRole('complementary', { name: 'PDF contents' })
    const list = screen.getByRole('list')
    list.scrollTop = 100
    const slider = screen.getByRole('slider', { name: 'Go to page' })
    const target =
      navigation === 'next'
        ? screen.getByRole('button', { name: 'Next page' })
        : navigation === 'outline'
          ? screen.getByRole('button', { name: 'Second, page 2' })
          : slider
    target.focus()
    await act(async () => {
      if (navigation === 'slider') fireEvent.change(slider, { target: { value: '2' } })
      else fireEvent.click(target)
    })

    expect(await screen.findByText('Rendering page…')).toBeVisible()
    expect(screen.queryByText('Preparing PDF preview')).not.toBeInTheDocument()
    expect(screen.getByRole('toolbar', { name: 'PDF controls' })).toBeVisible()
    expect(outline).toBeVisible()
    expect(slider).toHaveValue('2')
    expect(target).toHaveFocus()
    expect(list.scrollTop).toBe(100)

    await act(async () => resolvePage?.())
    expect(await screen.findByText('Page content 2')).toBeVisible()
    expect(screen.getByRole('complementary', { name: 'PDF contents' })).toBe(outline)
    expect(target).toHaveFocus()
    expect(list.scrollTop).toBe(100)
  },
)

it('contains a document failure and recovers when the source changes', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const view = render(<Reader source="blob:broken" />)

  expect(await screen.findByRole('heading', { name: 'Preview unavailable' })).toBeVisible()
  expect(screen.getByRole('toolbar', { name: 'PDF controls' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
  expect(log).toHaveBeenCalledWith(
    'Unable to display PDF',
    expect.objectContaining({ message: 'Invalid PDF structure' }),
    expect.any(String),
  )

  view.rerender(<Reader source="blob:valid" />)
  expect(await screen.findByText('Page content 1')).toBeVisible()
  expect(screen.queryByRole('heading', { name: 'Preview unavailable' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled()
})

it.each(['load', 'render'] as const)(
  'contains a page %s failure and allows navigation to another page',
  async failure => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    loading.pageFailure = failure
    render(<Reader />)
    fireEvent.click(await screen.findByRole('button', { name: 'Show table of contents' }))
    const outline = screen.getByRole('complementary', { name: 'PDF contents' })
    const next = screen.getByRole('button', { name: 'Next page' })
    await act(async () => fireEvent.click(next))

    expect(await screen.findByText('This page could not be rendered.')).toBeVisible()
    expect(outline).toBeVisible()
    expect(next).toBeEnabled()
    expect(screen.getByRole('slider', { name: 'Go to page' })).toHaveValue('2')
    expect(log).toHaveBeenCalledWith('Unable to display PDF', expect.any(Error), expect.any(String))

    await act(async () => fireEvent.click(next))
    expect(await screen.findByText('Page content 3')).toBeVisible()
    expect(screen.queryByText('This page could not be rendered.')).not.toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'PDF contents' })).toBe(outline)
  },
)
