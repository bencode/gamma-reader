import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Document, Page } from 'react-pdf'
import '../../core/pdf-source'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import type { StoredFileMetadata } from '../../core/files'
import { useReaderBinding } from '../../shell/workspace-context'
import { readViewport } from './reader-viewport'

export const PdfReader = ({
  document,
  blob,
  active,
}: {
  document: StoredFileMetadata
  blob: Blob
  active: boolean
}) => {
  const rootRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [textReadyPage, setTextReadyPage] = useState<number | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [width, setWidth] = useState(720)
  useReaderBinding(
    {
      fileId: document.id,
      getPageNumber: () => (pageCount > 0 ? pageNumber : undefined),
      getViewport: () =>
        textReadyPage === pageNumber
          ? readViewport(pageRef.current?.querySelector('.textLayer') ?? null, scrollRef.current)
          : null,
    },
    active,
  )

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
        ref={scrollRef}
        role="document"
        aria-label={`${document.name} page ${pageNumber}`}
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
              onRenderTextLayerSuccess={() => setTextReadyPage(pageNumber)}
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
    </div>
  )
}
