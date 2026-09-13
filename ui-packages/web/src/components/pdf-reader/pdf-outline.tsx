import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useRef, useState } from 'react'
import styles from './style.module.scss'

type PageReference = { num: number; gen: number }

export type PdfOutlineEntry = {
  key: string
  title: string
  depth: number
  pageNumber?: number
}

type RawOutlineEntry = {
  title: string
  destination: string | unknown[] | null
  children: RawOutlineEntry[]
}

export type PdfOutlineState =
  | { status: 'idle' | 'loading' | 'empty' | 'error' }
  | { status: 'ready'; entries: PdfOutlineEntry[] }

const objectRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined

const outlineEntryFrom = (value: unknown): RawOutlineEntry | undefined => {
  const record = objectRecord(value)
  if (!record || typeof record.title !== 'string') return undefined
  const destination =
    typeof record.dest === 'string' || Array.isArray(record.dest) ? record.dest : null
  const children = Array.isArray(record.items)
    ? record.items.flatMap(item => {
        const child = outlineEntryFrom(item)
        return child ? [child] : []
      })
    : []
  return {
    title: record.title.trim() || 'Untitled section',
    destination,
    children,
  }
}

const isPageReference = (value: unknown): value is PageReference => {
  const record = objectRecord(value)
  return Boolean(record && typeof record.num === 'number' && typeof record.gen === 'number')
}

const destinationPage = async (
  pdf: PDFDocumentProxy,
  destination: RawOutlineEntry['destination'],
  title: string,
) => {
  if (!destination) return undefined
  try {
    const resolved: unknown =
      typeof destination === 'string' ? await pdf.getDestination(destination) : destination
    if (!Array.isArray(resolved)) return undefined
    const reference: unknown = resolved[0]
    const index =
      typeof reference === 'number'
        ? reference
        : isPageReference(reference)
          ? await pdf.getPageIndex(reference)
          : undefined
    const pageNumber = index === undefined ? undefined : index + 1
    return pageNumber && pageNumber <= pdf.numPages ? pageNumber : undefined
  } catch (error) {
    console.error(`Unable to resolve PDF outline entry: ${title}`, error)
    return undefined
  }
}

const flattenOutline = async (
  pdf: PDFDocumentProxy,
  entries: readonly RawOutlineEntry[],
  depth = 0,
  parentKey = '',
): Promise<PdfOutlineEntry[]> => {
  const groups = await Promise.all(
    entries.map(async (entry, index) => {
      const key = parentKey ? `${parentKey}.${index}` : String(index)
      const pageNumber = await destinationPage(pdf, entry.destination, entry.title)
      const children = await flattenOutline(pdf, entry.children, depth + 1, key)
      return [{ key, title: entry.title, depth, pageNumber }, ...children]
    }),
  )
  return groups.flat()
}

export const loadPdfOutline = async (pdf: PDFDocumentProxy) => {
  const raw: unknown = await pdf.getOutline()
  if (!Array.isArray(raw)) return []
  const entries = raw.flatMap(item => {
    const entry = outlineEntryFrom(item)
    return entry ? [entry] : []
  })
  return flattenOutline(pdf, entries)
}

export const usePdfOutline = (pdf: PDFDocumentProxy | undefined): PdfOutlineState => {
  const [state, setState] = useState<PdfOutlineState>({ status: 'idle' })
  useEffect(() => {
    if (!pdf || pdf.loadingTask.destroyed) {
      setState({ status: 'idle' })
      return
    }
    let active = true
    setState({ status: 'loading' })
    void loadPdfOutline(pdf).then(
      entries => {
        if (active) setState(entries.length ? { status: 'ready', entries } : { status: 'empty' })
      },
      error => {
        if (!active) return
        console.error('Unable to load PDF contents', error)
        setState({ status: 'error' })
      },
    )
    return () => {
      active = false
    }
  }, [pdf])
  return state
}

const activeEntryKey = (entries: readonly PdfOutlineEntry[], pageNumber: number) =>
  entries.reduce<{ key: string; pageNumber: number; depth: number } | undefined>(
    (active, entry) => {
      if (entry.pageNumber === undefined || entry.pageNumber > pageNumber) return active
      if (
        !active ||
        entry.pageNumber > active.pageNumber ||
        (entry.pageNumber === active.pageNumber && entry.depth >= active.depth)
      )
        return { key: entry.key, pageNumber: entry.pageNumber, depth: entry.depth }
      return active
    },
    undefined,
  )?.key

export const PdfOutline = ({
  entries,
  pageNumber,
  onPageChange,
  onClose,
}: {
  entries: readonly PdfOutlineEntry[]
  pageNumber: number
  onPageChange: (pageNumber: number) => void
  onClose: () => void
}) => {
  const activeKey = activeEntryKey(entries, pageNumber)
  const focusKey = activeKey ?? entries.find(entry => entry.pageNumber !== undefined)?.key
  const focusRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    focusRef.current?.focus()
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', close, true)
    return () => document.removeEventListener('keydown', close, true)
  }, [onClose])

  return (
    <div className={styles.outlineLayer}>
      <button
        type="button"
        className={styles.outlineBackdrop}
        aria-label="Close PDF contents"
        onClick={onClose}
      />
      <aside className={styles.outlinePanel} aria-label="PDF contents">
        <ul>
          {entries.map(entry => {
            const destination = entry.pageNumber
            return (
              <li key={entry.key} className={entry.key === activeKey ? styles.active : undefined}>
                {destination === undefined ? (
                  <span
                    className={`${styles.outlineItem} ${styles.unavailable}`}
                    style={{ paddingInlineStart: 10 + entry.depth * 14 }}
                  >
                    <span>{entry.title}</span>
                  </span>
                ) : (
                  <button
                    ref={entry.key === focusKey ? focusRef : undefined}
                    type="button"
                    className={styles.outlineItem}
                    aria-label={`${entry.title}, page ${destination}`}
                    aria-current={entry.key === activeKey ? 'location' : undefined}
                    style={{ paddingInlineStart: 10 + entry.depth * 14 }}
                    onClick={() => onPageChange(destination)}
                  >
                    <span>{entry.title}</span>
                    <small>{destination}</small>
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </aside>
    </div>
  )
}
