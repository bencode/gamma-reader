import { GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export const pdfDocumentOptions = {
  wasmUrl: `${import.meta.env.BASE_URL}wasm/`,
}
