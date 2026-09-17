import type { PDFDocumentProxy } from 'pdfjs-dist'
import { forwardRef, Suspense, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Document, Page } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { pdfDocumentOptions } from '../../pdfjs'
import { PdfErrorBoundary } from './pdf-error-boundary'
import { PdfOutline, usePdfOutline } from './pdf-outline'
import { PdfToolbar } from './pdf-toolbar'
import styles from './style.module.scss'
import { usePdfPan } from './use-pdf-pan'

export type PdfRenderedPage = {
  textLayer: HTMLElement
  scrollContainer: HTMLElement
}

export type PdfReaderHandle = {
  getPageCount: () => number
  getRenderedPage: () => PdfRenderedPage | null
}

export type PdfReadingTheme = 'original' | 'paper' | 'dark'

const pageColors: Record<
  Exclude<PdfReadingTheme, 'original'>,
  { background: string; foreground: string }
> = {
  paper: { background: '#f3ead2', foreground: '#302b26' },
  dark: { background: '#1d1f20', foreground: '#e7e2d8' },
}

export type PdfReaderProps = {
  source: string
  name: string
  pageNumber: number
  theme: PdfReadingTheme
  onPageChange: (pageNumber: number) => void
  onThemeChange: (theme: PdfReadingTheme) => void
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value))

const embeddedOutlineMinimumWidth = 640

export const PdfReader = forwardRef<PdfReaderHandle, PdfReaderProps>(function PdfReader(
  { source, name, pageNumber, theme, onPageChange, onThemeChange },
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
        theme={theme}
        onPageChange={navigate}
        onZoomChange={changeZoom}
        onToggleOutline={() => setOutlineOpen(open => !open)}
        onPanActiveChange={setPanActive}
        onThemeChange={onThemeChange}
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
          data-reading-theme={theme}
          ref={scrollRef}
          role="document"
          aria-label={`${name} page ${pageNumber}`}
          {...pan.bindings}
        >
          <PdfErrorBoundary
            source={source}
            fallback={
              <div className="preview-state error-state">
                <h1>Preview unavailable</h1>
                <p>This PDF could not be opened.</p>
              </div>
            }
            onError={() => {
              setPdf(undefined)
              setPageCount(0)
              setTextReadyPage(undefined)
              setOutlineOpen(false)
            }}
          >
            <Suspense fallback={<div className="preview-state">Opening {name}…</div>}>
              <Document
                file={source}
                options={pdfDocumentOptions}
                onLoadSuccess={loadedPdf => {
                  setPdf(loadedPdf)
                  setPageCount(loadedPdf.numPages)
                  if (pageNumber > loadedPdf.numPages) onPageChange(loadedPdf.numPages)
                }}
              >
                <PdfErrorBoundary
                  source={source}
                  pageNumber={pageNumber}
                  fallback={
                    <div className="preview-state error-state">
                      This page could not be rendered.
                    </div>
                  }
                  onError={() => setTextReadyPage(undefined)}
                >
                  <Suspense fallback={<div className="preview-state">Rendering page…</div>}>
                    <div className={styles.page} ref={pageRef}>
                      <Page
                        pageNumber={pageNumber}
                        pageColors={theme === 'original' ? undefined : pageColors[theme]}
                        onRenderTextLayerSuccess={() => setTextReadyPage(pageNumber)}
                        width={Math.max(240, pageViewportWidth - 48) * zoom}
                      />
                    </div>
                  </Suspense>
                </PdfErrorBoundary>
              </Document>
            </Suspense>
          </PdfErrorBoundary>
        </div>
      </div>
    </div>
  )
})
