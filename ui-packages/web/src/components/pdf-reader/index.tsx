import type { PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { PdfOutline, usePdfOutline } from './pdf-outline'
import { PdfToolbar } from './pdf-toolbar'
import styles from './style.module.scss'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export type PdfRenderedPage = {
  textLayer: HTMLElement
  scrollContainer: HTMLElement
}

export type PdfReaderHandle = {
  getPageCount: () => number
  getRenderedPage: () => PdfRenderedPage | null
}

export type PdfReaderProps = {
  source: string
  name: string
  pageNumber: number
  onPageChange: (pageNumber: number) => void
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value))

export const PdfReader = forwardRef<PdfReaderHandle, PdfReaderProps>(function PdfReader(
  { source, name, pageNumber, onPageChange },
  ref,
) {
  const rootRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy>()
  const [pageCount, setPageCount] = useState(0)
  const [textReadyPage, setTextReadyPage] = useState<number>()
  const [zoom, setZoom] = useState(1)
  const [width, setWidth] = useState(720)
  const [outlineOpen, setOutlineOpen] = useState(false)
  const outline = usePdfOutline(pdf)
  const outlineEntries = outline.status === 'ready' ? outline.entries : []

  useImperativeHandle(
    ref,
    () => ({
      getPageCount: () => pageCount,
      getRenderedPage: () => {
        const textLayer = pageRef.current?.querySelector<HTMLElement>('.textLayer')
        const scrollContainer = scrollRef.current
        return textReadyPage === pageNumber && textLayer && scrollContainer
          ? { textLayer, scrollContainer }
          : null
      },
    }),
    [pageCount, pageNumber, textReadyPage],
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

  const navigate = (next: number) => {
    if (pageCount === 0) return
    const page = clamp(next, 1, pageCount)
    if (page === pageNumber) return
    setTextReadyPage(undefined)
    onPageChange(page)
  }

  return (
    <div className={`media-reader ${styles.reader}`} ref={rootRef}>
      <PdfToolbar
        pageNumber={pageNumber}
        pageCount={pageCount}
        zoom={zoom}
        outlineAvailable={outlineEntries.length > 0}
        outlineOpen={outlineOpen}
        onPageChange={navigate}
        onZoomChange={next => setZoom(clamp(next, 0.5, 2))}
        onToggleOutline={() => setOutlineOpen(open => !open)}
      />
      <div className={styles.stage}>
        <div
          className={styles.scroll}
          ref={scrollRef}
          role="document"
          aria-label={`${name} page ${pageNumber}`}
        >
          <Document
            file={source}
            loading={<div className="preview-state">Opening {name}…</div>}
            error={
              <div className="preview-state error-state">
                <h1>Preview unavailable</h1>
                <p>This PDF could not be opened.</p>
              </div>
            }
            onLoadSuccess={loadedPdf => {
              setPdf(loadedPdf)
              setPageCount(loadedPdf.numPages)
              if (pageNumber > loadedPdf.numPages) onPageChange(loadedPdf.numPages)
            }}
            onLoadError={error => {
              console.error('Unable to open PDF', error)
              setPdf(undefined)
              setPageCount(0)
              setOutlineOpen(false)
            }}
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
        {outlineOpen && outlineEntries.length > 0 && (
          <PdfOutline
            entries={outlineEntries}
            pageNumber={pageNumber}
            onPageChange={navigate}
            onClose={() => setOutlineOpen(false)}
          />
        )}
      </div>
    </div>
  )
})
