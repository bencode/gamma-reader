import { getDocument, type PDFDocumentLoadingTask, type PDFDocumentProxy } from 'pdfjs-dist'
import type { TextContent } from 'pdfjs-dist/types/src/display/api'
import { documentPagePixels, fitScale } from '../../../core/image-input'
import { pdfDocumentOptions } from '../../../pdfjs'

const maximumPageTextBytes = 8 * 1024 * 1024
const operationTimeoutMs = 30_000

export const openPdfSource = async (blob: Blob, signal?: AbortSignal) => {
  signal?.throwIfAborted()
  const url = URL.createObjectURL(blob)
  let task: PDFDocumentLoadingTask
  try {
    task = getDocument({ url, ...pdfDocumentOptions })
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
  const failure = new AbortController()
  task.onPassword = () => failure.abort(new Error('Password-protected PDFs are not supported.'))
  let destruction: Promise<void> | undefined
  let lastText: { page: number; text: string } | undefined
  const destroy = () => {
    failure.abort(new Error('PDF document was closed.'))
    lastText = undefined
    destruction ??= task.destroy().finally(() => URL.revokeObjectURL(url))
    return destruction
  }

  const run = async <T>(operation: () => Promise<T>, abortSignal?: AbortSignal): Promise<T> => {
    abortSignal?.throwIfAborted()
    failure.signal.throwIfAborted()
    const abort = () => failure.abort(abortSignal?.reason)
    abortSignal?.addEventListener('abort', abort, { once: true })
    const timeout = setTimeout(
      () => failure.abort(new Error('PDF operation timed out. Try a different page.')),
      operationTimeoutMs,
    )
    let rejectAborted: (() => void) | undefined
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAborted = () => reject(failure.signal.reason)
      failure.signal.addEventListener('abort', rejectAborted, { once: true })
    })
    try {
      const pending = Promise.resolve().then(operation)
      const result = await Promise.race([pending, aborted])
      failure.signal.throwIfAborted()
      return result
    } catch (error) {
      try {
        await destroy()
      } catch (cleanupError) {
        console.error('Unable to release PDF', cleanupError)
      }
      throw error
    } finally {
      clearTimeout(timeout)
      abortSignal?.removeEventListener('abort', abort)
      if (rejectAborted) failure.signal.removeEventListener('abort', rejectAborted)
    }
  }

  const pdf = await run(() => task.promise, signal)
  const withDocument = <T>(
    operation: (document: PDFDocumentProxy) => Promise<T>,
    abortSignal?: AbortSignal,
  ) =>
    run(() => {
      failure.signal.throwIfAborted()
      return operation(pdf)
    }, abortSignal)

  const readPage = (number: number, abortSignal?: AbortSignal) =>
    withDocument(async document => {
      if (lastText?.page === number) return lastText.text
      lastText = undefined
      const page = await document.getPage(number)
      try {
        failure.signal.throwIfAborted()
        const reader = (page.streamTextContent() as ReadableStream<TextContent>).getReader()
        const cancel = () => {
          void reader.cancel(failure.signal.reason).catch(error => {
            console.error('Unable to cancel PDF text stream', error)
          })
        }
        failure.signal.addEventListener('abort', cancel, { once: true })
        try {
          const parts: string[] = []
          let bytes = 0
          const encoder = new TextEncoder()
          while (true) {
            const chunk = await reader.read()
            failure.signal.throwIfAborted()
            if (chunk.done) break
            const text = chunk.value.items
              .flatMap(item => ('str' in item ? [item.str, item.hasEOL ? '\n' : ' '] : []))
              .join('')
            bytes += encoder.encode(text).length
            if (bytes > maximumPageTextBytes) {
              await reader.cancel('Page text limit exceeded')
              throw new Error('Page text exceeds 8 MiB. Use analyze_pdf_page to inspect this page.')
            }
            parts.push(text)
          }
          const text = parts.join('').trim()
          lastText = { page: number, text }
          return text
        } finally {
          failure.signal.removeEventListener('abort', cancel)
          reader.releaseLock()
        }
      } finally {
        page.cleanup()
      }
    }, abortSignal)

  const renderPage = (number: number, abortSignal?: AbortSignal) =>
    withDocument(async document => {
      const page = await document.getPage(number)
      const canvas = window.document.createElement('canvas')
      try {
        failure.signal.throwIfAborted()
        const base = page.getViewport({ scale: 2 })
        const ratio = fitScale(base.width, base.height, documentPagePixels)
        const viewport = page.getViewport({ scale: 2 * ratio })
        canvas.width = Math.max(1, Math.floor(viewport.width))
        canvas.height = Math.max(1, Math.floor(viewport.height))
        const rendering = page.render({ canvas, viewport, background: '#ffffff' })
        await rendering.promise
        failure.signal.throwIfAborted()
        return await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            image => (image ? resolve(image) : reject(new Error('Unable to encode the PDF page.'))),
            'image/png',
          ),
        )
      } finally {
        canvas.width = 0
        canvas.height = 0
        page.cleanup()
      }
    }, abortSignal)

  return {
    pageCount: pdf.numPages,
    withDocument,
    readPage,
    renderPage,
    destroy,
    get destroyed() {
      return failure.signal.aborted
    },
  }
}
export type PdfSource = Awaited<ReturnType<typeof openPdfSource>>
