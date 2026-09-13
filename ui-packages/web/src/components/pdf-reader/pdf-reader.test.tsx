import { fireEvent, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { describe, expect, it, vi } from 'vitest'
import { loadPdfOutline, PdfOutline, usePdfOutline } from './pdf-outline'
import { PdfToolbar } from './pdf-toolbar'

const toolbar = (overrides: Partial<Parameters<typeof PdfToolbar>[0]> = {}) => {
  const onPageChange = vi.fn()
  const props = {
    pageNumber: 3,
    pageCount: 10,
    zoom: 1,
    outlineAvailable: true,
    outlineOpen: false,
    onPageChange,
    onZoomChange: vi.fn(),
    onToggleOutline: vi.fn(),
    ...overrides,
  }
  render(<PdfToolbar {...props} />)
  return { onPageChange }
}

describe('PDF reader controls', () => {
  it('navigates with buttons, a page number, and the page range', async () => {
    const user = userEvent.setup()
    const { onPageChange } = toolbar()

    await user.click(screen.getByRole('button', { name: 'Previous page' }))
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    const pageInput = screen.getByRole('textbox', { name: 'Page number' })
    await user.clear(pageInput)
    await user.type(pageInput, '8{Enter}')
    fireEvent.change(screen.getByRole('slider', { name: 'Go to page' }), {
      target: { value: '6' },
    })

    expect(onPageChange.mock.calls).toEqual([[2], [4], [8], [6]])
  })

  it('rejects an invalid page and only offers contents when the PDF has an outline', async () => {
    const user = userEvent.setup()
    const { onPageChange } = toolbar()
    const pageInput = screen.getByRole('textbox', { name: 'Page number' })

    await user.clear(pageInput)
    await user.type(pageInput, '11{Enter}')

    expect(pageInput).toHaveValue('3')
    expect(onPageChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Table of contents' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )

    render(
      <PdfToolbar
        pageNumber={1}
        pageCount={1}
        zoom={1}
        outlineAvailable={false}
        outlineOpen={false}
        onPageChange={vi.fn()}
        onZoomChange={vi.fn()}
        onToggleOutline={vi.fn()}
      />,
    )
    expect(screen.getAllByRole('button', { name: 'Table of contents' })).toHaveLength(1)
  })

  it('resolves named, referenced, and direct outline destinations', async () => {
    const pdf = {
      numPages: 10,
      getOutline: vi.fn().mockResolvedValue([
        {
          title: 'Introduction',
          dest: 'intro',
          items: [{ title: 'Details', dest: [{ num: 7, gen: 0 }], items: [] }],
        },
        { title: 'Direct page', dest: [3], items: [] },
        { title: 'External resource', url: 'https://example.com', items: [] },
      ]),
      getDestination: vi.fn().mockResolvedValue([{ num: 1, gen: 0 }]),
      getPageIndex: vi.fn(({ num }: { num: number }) => Promise.resolve(num - 1)),
    } as unknown as PDFDocumentProxy

    await expect(loadPdfOutline(pdf)).resolves.toEqual([
      { key: '0', title: 'Introduction', depth: 0, pageNumber: 1 },
      { key: '0.0', title: 'Details', depth: 1, pageNumber: 7 },
      { key: '1', title: 'Direct page', depth: 0, pageNumber: 4 },
      { key: '2', title: 'External resource', depth: 0, pageNumber: undefined },
    ])
  })

  it('does not read the outline from a PDF.js instance destroyed by Activity', () => {
    const getOutline = vi.fn()
    const pdf = {
      loadingTask: { destroyed: true },
      getOutline,
    } as unknown as PDFDocumentProxy

    const { result } = renderHook(() => usePdfOutline(pdf))

    expect(result.current).toEqual({ status: 'idle' })
    expect(getOutline).not.toHaveBeenCalled()
  })

  it('opens an outline destination and closes the overlay', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    const onClose = vi.fn()
    render(
      <PdfOutline
        entries={[
          { key: 'one', title: 'First chapter', depth: 0, pageNumber: 1 },
          { key: 'two', title: 'Second chapter', depth: 0, pageNumber: 5 },
        ]}
        pageNumber={2}
        onPageChange={onPageChange}
        onClose={onClose}
      />,
    )

    expect(screen.getByRole('button', { name: 'First chapter, page 1' })).toHaveAttribute(
      'aria-current',
      'location',
    )
    await user.click(screen.getByRole('button', { name: 'Second chapter, page 5' }))
    expect(onPageChange).toHaveBeenCalledWith(5)
    expect(onClose).toHaveBeenCalledOnce()
  })
})
