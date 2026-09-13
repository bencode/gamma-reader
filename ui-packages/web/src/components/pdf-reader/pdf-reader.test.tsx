import { fireEvent, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { describe, expect, it, vi } from 'vitest'
import { loadPdfOutline, PdfOutline, usePdfOutline } from './pdf-outline'
import { PdfToolbar } from './pdf-toolbar'
import { usePdfPan } from './use-pdf-pan'

const toolbar = (overrides: Partial<Parameters<typeof PdfToolbar>[0]> = {}) => {
  const onPageChange = vi.fn()
  const onPanActiveChange = vi.fn()
  const onToggleOutline = vi.fn()
  const props = {
    pageNumber: 3,
    pageCount: 10,
    zoom: 1,
    outlineAvailable: true,
    outlineOpen: false,
    panAvailable: false,
    panActive: false,
    onPageChange,
    onZoomChange: vi.fn(),
    onToggleOutline,
    onPanActiveChange,
    ...overrides,
  }
  render(<PdfToolbar {...props} />)
  return { onPageChange, onPanActiveChange, onToggleOutline }
}

const PanSurface = ({ enabled }: { enabled: boolean }) => {
  const pan = usePdfPan(enabled)
  return <div data-testid="pan-surface" data-dragging={pan.dragging} {...pan.bindings} />
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

  it('makes the page number easy to replace and exposes pan mode when zoomed', async () => {
    const user = userEvent.setup()
    const select = vi.spyOn(HTMLInputElement.prototype, 'select')
    const { onPanActiveChange } = toolbar({ zoom: 1.2, panAvailable: true })

    await user.click(screen.getByRole('textbox', { name: 'Page number' }))
    await user.click(screen.getByRole('button', { name: 'Pan document' }))

    expect(select).toHaveBeenCalledOnce()
    expect(onPanActiveChange).toHaveBeenCalledWith(true)
    select.mockRestore()
  })

  it('rejects an invalid page and only offers contents when the PDF has an outline', async () => {
    const user = userEvent.setup()
    const { onPageChange } = toolbar()
    const pageInput = screen.getByRole('textbox', { name: 'Page number' })

    await user.clear(pageInput)
    await user.type(pageInput, '11{Enter}')

    expect(pageInput).toHaveValue('3')
    expect(onPageChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Show table of contents' })).toHaveAttribute(
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
        panAvailable={false}
        panActive={false}
        onPageChange={vi.fn()}
        onZoomChange={vi.fn()}
        onToggleOutline={vi.fn()}
        onPanActiveChange={vi.fn()}
      />,
    )
    expect(screen.getAllByRole('button', { name: 'Show table of contents' })).toHaveLength(1)
  })

  it('uses one stable control to show and hide the outline', async () => {
    const user = userEvent.setup()
    const { onToggleOutline } = toolbar({ outlineOpen: true })
    const toggle = screen.getByRole('button', { name: 'Hide table of contents' })

    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await user.click(toggle)
    expect(onToggleOutline).toHaveBeenCalledOnce()
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

  it('opens outline destinations without deciding whether the parent closes the outline', async () => {
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
    expect(onClose).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Close PDF contents' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('pans a zoomed page with the primary mouse button', () => {
    render(<PanSurface enabled />)
    const surface = screen.getByTestId('pan-surface')
    surface.scrollLeft = 80
    surface.scrollTop = 120
    surface.setPointerCapture = vi.fn()
    surface.hasPointerCapture = vi.fn(() => true)
    surface.releasePointerCapture = vi.fn()

    fireEvent.pointerDown(surface, {
      pointerId: 4,
      pointerType: 'mouse',
      button: 0,
      clientX: 100,
      clientY: 100,
    })
    fireEvent.pointerMove(surface, {
      pointerId: 4,
      pointerType: 'mouse',
      clientX: 70,
      clientY: 60,
    })

    expect(surface).toHaveAttribute('data-dragging', 'true')
    expect(surface.scrollLeft).toBe(110)
    expect(surface.scrollTop).toBe(160)

    fireEvent.pointerUp(surface, { pointerId: 4, pointerType: 'mouse' })
    fireEvent.pointerMove(surface, {
      pointerId: 4,
      pointerType: 'mouse',
      clientX: 20,
      clientY: 20,
    })

    expect(surface).toHaveAttribute('data-dragging', 'false')
    expect(surface.scrollLeft).toBe(110)
    expect(surface.scrollTop).toBe(160)
    expect(surface.releasePointerCapture).toHaveBeenCalledWith(4)

    fireEvent.pointerDown(surface, {
      pointerId: 5,
      pointerType: 'touch',
      button: 0,
      clientX: 100,
      clientY: 100,
    })
    expect(surface.setPointerCapture).toHaveBeenCalledTimes(1)
    expect(surface).toHaveAttribute('data-dragging', 'false')
  })
})
