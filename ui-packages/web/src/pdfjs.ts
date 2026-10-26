import { GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
// react-pdf names a worker of its own as it loads. Loading it first, whichever of the reader and
// the assistant opens a PDF first, keeps the worker this build serves.
import 'react-pdf'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export const pdfDocumentOptions = {
  wasmUrl: `${import.meta.env.BASE_URL}wasm/`,
}
