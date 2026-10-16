import { ChevronLeft, ChevronRight } from 'lucide-react'
import { type FormEvent, type KeyboardEvent, useEffect, useState } from 'react'
import styles from './style.module.scss'

type PdfNavigationProps = {
  pageNumber: number
  pageCount: number
  onPageChange: (pageNumber: number) => void
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

export const PdfNavigation = ({ pageNumber, pageCount, onPageChange }: PdfNavigationProps) => (
  <nav className={styles.navigation} aria-label="PDF page navigation">
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
  </nav>
)
