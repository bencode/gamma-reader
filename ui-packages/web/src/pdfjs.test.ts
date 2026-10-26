import { expect, it } from 'vitest'

it('keeps its worker when the assistant reads a PDF before the reader loads react-pdf', async () => {
  // The assistant's PDF tools bring in this module first; react-pdf names a worker of its own
  // as it loads, which this build does not serve.
  await import('./pdfjs')
  await import('react-pdf')
  const { GlobalWorkerOptions } = await import('pdfjs-dist')
  expect(GlobalWorkerOptions.workerSrc).toMatch(/pdf\.worker\.min\.mjs/)
})
