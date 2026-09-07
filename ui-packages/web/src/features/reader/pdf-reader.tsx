import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import type { StoredFileMetadata } from '../../core/files'
import { ReaderSelectionAction, useReaderSelection } from './reader-selection'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export const PdfReader = ({
  document,
  blob,
  active,
  onQuote,
}: {
  document: StoredFileMetadata
  blob: Blob
  active: boolean
  onQuote: (documentId: string, text: string) => void
}) => {
  const rootRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [pageCount, setPageCount] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [width, setWidth] = useState(720)
  const { selection, setSelection, captureSelection } = useReaderSelection({
    active,
    rootRef,
    boundaryRef: pageRef,
    resetKey: `${document.id}:${document.revision}:${pageNumber}`,
  })

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="media-reader" ref={rootRef}>
      <div className="preview-toolbar" role="toolbar" aria-label="PDF controls">
        <button
          type="button"
          className="icon-button"
          aria-label="Previous page"
          disabled={pageNumber <= 1}
          onClick={() => setPageNumber(current => Math.max(1, current - 1))}
        >
          <ChevronLeft size={16} />
        </button>
        <span className="page-count">
          {pageNumber} / {pageCount || '…'}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label="Next page"
          disabled={pageCount === 0 || pageNumber >= pageCount}
          onClick={() => setPageNumber(current => Math.min(pageCount, current + 1))}
        >
          <ChevronRight size={16} />
        </button>
        <span className="toolbar-divider" />
        <button
          type="button"
          className="icon-button"
          aria-label="Zoom out"
          disabled={zoom <= 0.5}
          onClick={() => setZoom(current => Math.max(0.5, current - 0.1))}
        >
          <Minus size={15} />
        </button>
        <button type="button" className="toolbar-value" onClick={() => setZoom(1)}>
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Zoom in"
          disabled={zoom >= 2}
          onClick={() => setZoom(current => Math.min(2, current + 0.1))}
        >
          <Plus size={15} />
        </button>
      </div>
      <div
        className="pdf-scroll"
        role="document"
        aria-label={`${document.name} page ${pageNumber}`}
        onPointerUp={captureSelection}
        onKeyUp={captureSelection}
      >
        <Document
          file={blob}
          loading={<div className="preview-state">Opening {document.name}…</div>}
          error={
            <div className="preview-state error-state">
              <h1>Preview unavailable</h1>
              <p>This PDF could not be opened.</p>
            </div>
          }
          onLoadSuccess={pdf => {
            setPageCount(pdf.numPages)
            setPageNumber(current => Math.min(current, pdf.numPages))
          }}
          onLoadError={error => console.error('Unable to open PDF', error)}
        >
          <div ref={pageRef}>
            <Page
              pageNumber={pageNumber}
              width={Math.max(240, width - 48) * zoom}
              loading={<div className="preview-state">Rendering page…</div>}
              error={
                <div className="preview-state error-state">This page could not be rendered.</div>
              }
              onRenderError={error => console.error('Unable to render PDF page', error)}
            />
          </div>
        </Document>
      </div>
      {selection && active && (
        <ReaderSelectionAction
          selection={selection}
          onAsk={text => {
            onQuote(document.id, text)
            window.getSelection()?.removeAllRanges()
            setSelection(null)
          }}
        />
      )}
    </div>
  )
}
