import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openPdfSource } from './source'

const mocks = vi.hoisted(() => ({ getDocument: vi.fn() }))
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: mocks.getDocument,
}))

const textPage = (text: string) => ({
  streamTextContent: () =>
    new ReadableStream({
      start(controller) {
        controller.enqueue({ items: [{ str: text, hasEOL: true }] })
        controller.close()
      },
    }),
  cleanup: vi.fn(),
})
const setup = (text = 'A readable page') => {
  const page = textPage(text)
  const getPage = vi.fn(async () => page)
  const destroy = vi.fn(async () => {})
  mocks.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 2, getPage }), destroy })
  return { page, getPage, destroy }
}

beforeEach(() => {
  mocks.getDocument.mockReset()
})

describe('PDF source', () => {
  it('loads a Blob URL, reuses the last page, and releases the document and URL once', async () => {
    const { page, getPage, destroy } = setup()
    const blob = new Blob(['PDF fixture'])
    const wholeRead = vi.spyOn(blob, 'arrayBuffer')
    const source = await openPdfSource(blob)
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob)
    expect(mocks.getDocument).toHaveBeenCalledWith({
      url: 'blob:gamma-reader-preview',
      wasmUrl: '/wasm/',
    })
    expect(await source.readPage(1)).toBe('A readable page')
    expect(await source.readPage(1)).toBe('A readable page')
    expect(getPage).toHaveBeenCalledTimes(1)
    expect(page.cleanup).toHaveBeenCalledOnce()
    expect(wholeRead).not.toHaveBeenCalled()
    const closing = source.destroy()
    expect(source.destroy()).toBe(closing)
    await closing
    expect(destroy).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:gamma-reader-preview')
    expect(source.destroyed).toBe(true)
    await expect(source.readPage(1)).rejects.toThrow('closed')
  })

  it.each(['setup', 'loading'] as const)('releases the URL after a %s failure', async stage => {
    const error = new Error('Invalid PDF')
    const { destroy } = setup()
    if (stage === 'setup')
      mocks.getDocument.mockImplementation(() => {
        throw error
      })
    else mocks.getDocument.mockReturnValue({ promise: Promise.reject(error), destroy })
    await expect(openPdfSource(new Blob(['pdf']))).rejects.toBe(error)
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce()
    expect(destroy).toHaveBeenCalledTimes(stage === 'loading' ? 1 : 0)
  })

  it('rejects oversized page text without silently truncating it', async () => {
    const { destroy, page } = setup('x'.repeat(8 * 1024 * 1024 + 1))
    const source = await openPdfSource(new Blob(['pdf']))
    await expect(source.readPage(1)).rejects.toThrow('exceeds 8 MiB')
    expect(destroy).toHaveBeenCalledOnce()
    expect(page.cleanup).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce()
  })

  it('cancels initial loading through the loading task', async () => {
    let rejectLoading: ((reason: Error) => void) | undefined
    const pending = new Promise<never>((_resolve, reject) => {
      rejectLoading = reject
    })
    const destroy = vi.fn(async () => rejectLoading?.(new Error('Loading stopped')))
    mocks.getDocument.mockReturnValue({ promise: pending, destroy })
    const controller = new AbortController()
    const loading = openPdfSource(new Blob(['pdf']), controller.signal)
    const rejected = expect(loading).rejects.toThrow('Cancelled by reader')
    controller.abort(new Error('Cancelled by reader'))
    await rejected
    expect(destroy).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce()
  })

  it('destroys an in-flight text extraction when the tool is cancelled', async () => {
    const cancel = vi.fn()
    const stream = new ReadableStream({ cancel })
    const page = {
      streamTextContent: vi.fn(() => stream),
      cleanup: vi.fn(),
    }
    const destroy = vi.fn(async () => {})
    mocks.getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 1, getPage: async () => page }),
      destroy,
    })
    const source = await openPdfSource(new Blob(['pdf']))
    const controller = new AbortController()
    const read = source.readPage(1, controller.signal)
    const rejected = expect(read).rejects.toThrow('Cancelled by reader')
    await vi.waitFor(() => expect(page.streamTextContent).toHaveBeenCalledOnce())
    controller.abort(new Error('Cancelled by reader'))
    await rejected
    expect(destroy).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledOnce()
    expect(stream.locked).toBe(false)
    expect(page.cleanup).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce()
  })

  it('uses document destruction to cancel rendering and releases its canvas', async () => {
    let rejectRender: ((reason: Error) => void) | undefined
    const pending = new Promise<void>((_resolve, reject) => {
      rejectRender = reject
    })
    let canvas: HTMLCanvasElement | undefined
    const page = {
      getViewport: () => ({ width: 100, height: 200 }),
      render: vi.fn((options: { canvas: HTMLCanvasElement }) => {
        canvas = options.canvas
        return { promise: pending }
      }),
      cleanup: vi.fn(),
    }
    const destroy = vi.fn(async () => rejectRender?.(new Error('Rendering cancelled')))
    mocks.getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 1, getPage: async () => page }),
      destroy,
    })
    const source = await openPdfSource(new Blob(['pdf']))
    const controller = new AbortController()
    const rendering = source.renderPage(1, controller.signal)
    const rejected = expect(rendering).rejects.toThrow('Cancelled by reader')
    await vi.waitFor(() => expect(page.render).toHaveBeenCalledOnce())
    controller.abort(new Error('Cancelled by reader'))
    await rejected
    expect(canvas?.width).toBe(0)
    expect(canvas?.height).toBe(0)
    expect(page.cleanup).toHaveBeenCalledOnce()
    expect(destroy).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce()
  })

  it('preserves the original failure and releases the URL if cleanup also fails', async () => {
    const failure = new Error('Invalid PDF')
    const cleanupFailure = new Error('Cleanup failed')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.getDocument.mockReturnValue({
      promise: Promise.reject(failure),
      destroy: vi.fn(async () => {
        throw cleanupFailure
      }),
    })
    await expect(openPdfSource(new Blob(['pdf']))).rejects.toBe(failure)
    expect(log).toHaveBeenCalledWith('Unable to release PDF', cleanupFailure)
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce()
  })

  it('cleans up when a document operation throws synchronously', async () => {
    const { destroy } = setup()
    const source = await openPdfSource(new Blob(['pdf']))
    const error = new Error('Invalid document operation')
    await expect(
      source.withDocument(() => {
        throw error
      }),
    ).rejects.toBe(error)
    expect(destroy).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce()
  })

  it('times out loading and releases its resources', async () => {
    vi.useFakeTimers()
    try {
      const destroy = vi.fn(async () => {})
      mocks.getDocument.mockReturnValue({ promise: new Promise(() => {}), destroy })
      const loading = openPdfSource(new Blob(['pdf']))
      const rejected = expect(loading).rejects.toThrow('timed out')
      await vi.advanceTimersByTimeAsync(30_000)
      await rejected
      expect(destroy).toHaveBeenCalledOnce()
      expect(URL.revokeObjectURL).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
})
