import { useRef, useState } from 'react'
import { PdfReader as DocumentPdfReader, type PdfReaderHandle } from '../../components/pdf-reader'
import type { StoredFileMetadata } from '../../core/files'
import { useReaderBinding } from '../../shell/workspace-context'
import { readViewport } from './reader-viewport'

export const PdfReader = ({
  document,
  source,
  active,
}: {
  document: StoredFileMetadata
  source: string
  active: boolean
}) => {
  const readerRef = useRef<PdfReaderHandle>(null)
  const [pageNumber, setPageNumber] = useState(1)
  useReaderBinding(
    {
      fileId: document.id,
      getPageNumber: () => (readerRef.current?.getPageCount() ? pageNumber : undefined),
      getViewport: () => {
        const rendered = readerRef.current?.getRenderedPage()
        return rendered ? readViewport(rendered.textLayer, rendered.scrollContainer) : null
      },
    },
    active,
  )

  return (
    <DocumentPdfReader
      ref={readerRef}
      source={source}
      name={document.name}
      pageNumber={pageNumber}
      onPageChange={setPageNumber}
    />
  )
}
