import { ChevronLeft, ChevronRight, Hand, Minus, PanelLeft, Plus } from 'lucide-react'
import { type FormEvent, type KeyboardEvent, useEffect, useState } from 'react'
import styles from './style.module.scss'

type PdfToolbarProps = {
  pageNumber: number
  pageCount: number
  zoom: number
  outlineAvailable: boolean
  outlineOpen: boolean
  panAvailable: boolean
  panActive: boolean
  onPageChange: (pageNumber: number) => void
  onZoomChange: (zoom: number) => void
  onToggleOutline: () => void
  onPanActiveChange: (active: boolean) => void
}

const PageNumberInput = ({
  pageNumber,
  pageCount,
  onPageChange,
}: {
  pageNumber: number
  pageCount: number
  onPageChange: (pageNumber: number) => void
}) => {
  const [value, setValue] = useState(String(pageNumber))
  useEffect(() => setValue(String(pageNumber)), [pageNumber])

  const commit = () => {
    const next = Number(value)
    if (!Number.isInteger(next) || next < 1 || next > pageCount) {
      setValue(String(pageNumber))
      return
    }
    if (next !== pageNumber) onPageChange(next)
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    commit()
  }
  const reset = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    setValue(String(pageNumber))
  }

  return (
    <form className={styles.pageForm} onSubmit={submit}>
      <input
        type="text"
        inputMode="numeric"
        aria-label="Page number"
        value={value}
        disabled={pageCount === 0}
        onChange={event => setValue(event.target.value)}
        onBlur={commit}
        onFocus={event => event.currentTarget.select()}
        onKeyDown={reset}
      />
      <span aria-hidden="true">/</span>
      <span>{pageCount || '…'}</span>
    </form>
  )
}

export const PdfToolbar = ({
  pageNumber,
  pageCount,
  zoom,
  outlineAvailable,
  outlineOpen,
  panAvailable,
  panActive,
  onPageChange,
  onZoomChange,
  onToggleOutline,
  onPanActiveChange,
}: PdfToolbarProps) => (
  <div
    className={`preview-toolbar ${styles.toolbar} ${outlineAvailable ? styles.toolbarWithOutline : ''}`}
    role="toolbar"
    aria-label="PDF controls"
  >
    {outlineAvailable && (
      <button
        type="button"
        className={
          outlineOpen
            ? `icon-button ${styles.outlineToggle} ${styles.activeControl}`
            : `icon-button ${styles.outlineToggle}`
        }
        aria-label={outlineOpen ? 'Hide table of contents' : 'Show table of contents'}
        aria-pressed={outlineOpen}
        title={outlineOpen ? 'Hide table of contents' : 'Show table of contents'}
        onClick={onToggleOutline}
      >
        <PanelLeft size={16} />
      </button>
    )}
    <span className={styles.controls}>
      <button
        type="button"
        className="icon-button"
        aria-label="Previous page"
        disabled={pageNumber <= 1}
        onClick={() => onPageChange(pageNumber - 1)}
      >
        <ChevronLeft size={16} />
      </button>
      <PageNumberInput pageNumber={pageNumber} pageCount={pageCount} onPageChange={onPageChange} />
      <button
        type="button"
        className="icon-button"
        aria-label="Next page"
        disabled={pageCount === 0 || pageNumber >= pageCount}
        onClick={() => onPageChange(pageNumber + 1)}
      >
        <ChevronRight size={16} />
      </button>
    </span>
    {pageCount > 1 && (
      <input
        className={styles.pageRange}
        type="range"
        min={1}
        max={pageCount}
        value={pageNumber}
        aria-label="Go to page"
        aria-valuetext={`Page ${pageNumber} of ${pageCount}`}
        onChange={event => onPageChange(Number(event.target.value))}
      />
    )}
    <span className="toolbar-divider" aria-hidden="true" />
    <span className={styles.controls}>
      <button
        type="button"
        className={panActive ? `icon-button ${styles.activeControl}` : 'icon-button'}
        aria-label={panActive ? 'Select text' : 'Pan document'}
        aria-pressed={panActive}
        title={panActive ? 'Select text' : 'Pan document'}
        disabled={!panAvailable}
        onClick={() => onPanActiveChange(!panActive)}
      >
        <Hand size={15} />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="Zoom out"
        disabled={zoom <= 0.5}
        onClick={() => onZoomChange(zoom - 0.1)}
      >
        <Minus size={15} />
      </button>
      <button type="button" className="toolbar-value" onClick={() => onZoomChange(1)}>
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="Zoom in"
        disabled={zoom >= 2}
        onClick={() => onZoomChange(zoom + 0.1)}
      >
        <Plus size={15} />
      </button>
    </span>
  </div>
)
