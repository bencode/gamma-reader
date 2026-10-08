import { useEffect, useRef, useState } from 'react'
import { PdfReader as DocumentPdfReader, type PdfReaderHandle } from '../../components/pdf-reader'
import type { StoredFileMetadata } from '../../core/files'
import type { ReadingPositionProps } from '../../core/reading-position'
import { useReaderBinding, useReveal } from '../workspace/workspace-context'
import { usePdfReadingTheme } from './pdf-reading-preferences'
import { readViewport } from './reader-viewport'

export const PdfReader = ({
  document,
  source,
  active,
  defaultPosition,
  onPositionChange,
}: ReadingPositionProps & {
  document: StoredFileMetadata
  source: string
  active: boolean
}) => {
  const readerRef = useRef<PdfReaderHandle>(null)
  const [pageNumber, setPageNumber] = useState(
    defaultPosition?.kind === 'page' ? defaultPosition.page : 1,
  )
  const [theme, setTheme] = usePdfReadingTheme()
  // A link such as [[paper.pdf#page=12]] that led here opens at its page.
  const { reveal, shown } = useReveal(document.id)
  useEffect(() => {
    if (!reveal) return
    if ('page' in reveal.target) {
      setPageNumber(reveal.target.page)
      onPositionChange({ kind: 'page', page: reveal.target.page })
    }
    shown(reveal)
  }, [onPositionChange, reveal, shown])
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
      name={document.path}
      pageNumber={pageNumber}
      theme={theme}
      onPageChange={page => {
        setPageNumber(page)
        onPositionChange({ kind: 'page', page })
      }}
      onThemeChange={setTheme}
    />
  )
}
