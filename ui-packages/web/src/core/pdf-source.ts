import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { pdfjs } from 'react-pdf'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export const openPdfSource = async (blob: Blob, signal?: AbortSignal) => {
  signal?.throwIfAborted()
  const bytes = await blob.arrayBuffer()
  signal?.throwIfAborted()
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes) })
  try {
    const document = await task.promise
    signal?.throwIfAborted()
    return {
      pageCount: document.numPages,
      readPage: async (number: number) => {
        signal?.throwIfAborted()
        const page = await document.getPage(number)
        try {
          const content = await page.getTextContent()
          signal?.throwIfAborted()
          return content.items
            .flatMap(item => ('str' in item ? [item.str, item.hasEOL ? '\n' : ' '] : []))
            .join('')
            .trim()
        } finally {
          page.cleanup()
        }
      },
      close: () => task.destroy(),
    }
  } catch (error) {
    await task.destroy()
    throw error
  }
}
