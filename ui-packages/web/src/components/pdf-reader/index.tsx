import type { PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { PdfOutline, usePdfOutline } from './pdf-outline'
import { PdfToolbar } from './pdf-toolbar'
import styles from './style.module.scss'
import { usePdfPan } from './use-pdf-pan'

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

const embeddedOutlineMinimumWidth = 640

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
  const [readerWidth, setReaderWidth] = useState(0)
  const [pageViewportWidth, setPageViewportWidth] = useState(720)
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [panActive, setPanActive] = useState(false)
  const pan = usePdfPan(panActive)
  const outline = usePdfOutline(pdf)
  const outlineEntries = outline.status === 'ready' ? outline.entries : []
  const outlineLayout = readerWidth >= embeddedOutlineMinimumWidth ? 'embedded' : 'overlay'
  const outlineVisible = outlineOpen && outlineEntries.length > 0

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
    const scroll = scrollRef.current
    if (!root || !scroll) return
    const measure = () => {
      setReaderWidth(root.clientWidth)
      setPageViewportWidth(scroll.clientWidth)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    observer.observe(scroll)
    measure()
    return () => observer.disconnect()
  }, [])

  const navigate = (next: number) => {
    if (pageCount === 0) return
    const page = clamp(next, 1, pageCount)
    if (page === pageNumber) return
    setTextReadyPage(undefined)
    onPageChange(page)
  }

  const changeZoom = (next: number) => {
    const nextZoom = clamp(next, 0.5, 2)
    if (nextZoom <= 1) setPanActive(false)
    else if (zoom <= 1) setPanActive(true)
    setZoom(nextZoom)
  }

  const openOutlinePage = (next: number) => {
    navigate(next)
    if (outlineLayout === 'overlay') setOutlineOpen(false)
  }

  return (
    <div
      className={`media-reader ${styles.reader}`}
      ref={rootRef}
      data-outline-layout={outlineLayout}
      data-outline-open={outlineVisible}
    >
      <PdfToolbar
        pageNumber={pageNumber}
        pageCount={pageCount}
        zoom={zoom}
        outlineAvailable={outlineEntries.length > 0}
        outlineOpen={outlineOpen}
        panAvailable={zoom > 1}
        panActive={panActive}
        onPageChange={navigate}
        onZoomChange={changeZoom}
        onToggleOutline={() => setOutlineOpen(open => !open)}
        onPanActiveChange={setPanActive}
      />
      <div className={styles.stage}>
        {outlineVisible && (
          <PdfOutline
            entries={outlineEntries}
            pageNumber={pageNumber}
            onPageChange={openOutlinePage}
            onClose={() => setOutlineOpen(false)}
          />
        )}
        <div
          className={`${styles.scroll} ${panActive ? styles.pan : ''} ${pan.dragging ? styles.dragging : ''}`}
          ref={scrollRef}
          role="document"
          aria-label={`${name} page ${pageNumber}`}
          {...pan.bindings}
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
            <div className={styles.page} ref={pageRef}>
              <Page
                pageNumber={pageNumber}
                onRenderTextLayerSuccess={() => setTextReadyPage(pageNumber)}
                width={Math.max(240, pageViewportWidth - 48) * zoom}
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
    </div>
  )
})
