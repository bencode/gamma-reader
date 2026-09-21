import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { StoredFileMetadata } from '../../../core/files'
import {
  cellText,
  clampColumns,
  columnLabel,
  readSpreadsheet,
  type Worksheet,
} from '../../../core/xlsx'
import type { Workspace } from '../../../shell/use-workspace'
import { useReaderBinding } from '../../../shell/workspace-context'
import { readViewport } from '../reader-viewport'
import styles from './style.module.scss'

type XlsxReaderProps = {
  document: StoredFileMetadata
  blob: Blob
  active: boolean
  scrollPositions: Workspace['scrollPositions']
}

type SheetState =
  | { status: 'loading' }
  | { status: 'ready'; sheets: readonly Worksheet[] }
  | { status: 'error'; message: string }

// The virtualizer places rows by this height, so the stylesheet has to use the same number.
const rowHeight = 30

const openWorkbook = (blob: Blob): Promise<SheetState> =>
  readSpreadsheet(blob).then(
    sheets => ({ status: 'ready' as const, sheets }),
    error => {
      console.error('Unable to read spreadsheet', error)
      return {
        status: 'error' as const,
        message: 'This workbook could not be read. Only .xlsx files are supported.',
      }
    },
  )

export const XlsxReader = ({ document, blob, active, scrollPositions }: XlsxReaderProps) => {
  // Parsing is not free and both StrictMode and reopening a tab ask for the same workbook again.
  const workbook = useRef<{ id: string; revision: number; result: Promise<SheetState> }>(null)
  const [state, setState] = useState<SheetState>({ status: 'loading' })
  const [selected, setSelected] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)

  useEffect(() => {
    const cached = workbook.current
    const pending =
      cached?.id === document.id && cached.revision === document.revision
        ? cached
        : { id: document.id, revision: document.revision, result: openWorkbook(blob) }
    if (pending !== cached) {
      workbook.current = pending
      setState({ status: 'loading' })
      setSelected(0)
    }
    let current = true
    void pending.result.then(result => {
      if (current) setState(result)
    })
    return () => {
      current = false
    }
  }, [blob, document.id, document.revision])

  const binding = useMemo(
    () => ({
      fileId: document.id,
      getViewport: () => readViewport(tableRef.current, scrollRef.current),
    }),
    [document.id],
  )
  useReaderBinding(binding, active)

  const sheets = state.status === 'ready' ? state.sheets : []
  const rows = sheets[selected]?.rows ?? []
  const { columns, hidden } = useMemo(() => clampColumns(rows), [rows])
  // A column is identified by its letter, which is also what the header shows.
  const labels = useMemo(
    () => Array.from({ length: columns }, (_, column) => columnLabel(column)),
    [columns],
  )

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  })
  const items = virtualizer.getVirtualItems()
  const before = items[0]?.start ?? 0
  const after = virtualizer.getTotalSize() - (items[items.length - 1]?.end ?? 0)

  useEffect(() => {
    if (!active || !scrollRef.current) return
    scrollRef.current.scrollTop = scrollPositions.current.get(document.id) ?? 0
  }, [active, document.id, scrollPositions])

  if (state.status === 'loading')
    return <div className="preview-state">Opening {document.name}…</div>
  if (state.status === 'error')
    return (
      <div className="preview-state error-state">
        <h1>Preview unavailable</h1>
        <p>{state.message}</p>
      </div>
    )

  return (
    <div className={`reader-content ${styles.reader}`}>
      {sheets.length > 1 && (
        <div className={styles.tabs} role="tablist" aria-label="Sheets">
          {sheets.map((sheet, index) => (
            <button
              key={sheet.name}
              type="button"
              role="tab"
              className={styles.tab}
              aria-selected={index === selected}
              onClick={() => {
                setSelected(index)
                if (scrollRef.current) scrollRef.current.scrollTop = 0
              }}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      )}
      {hidden > 0 && (
        <p className={styles.notice}>
          Showing the first {columns} of {columns + hidden} columns. The assistant reads them all.
        </p>
      )}
      <div
        className={styles.scroll}
        ref={scrollRef}
        onScroll={event => {
          if (active) scrollPositions.current.set(document.id, event.currentTarget.scrollTop)
        }}
      >
        {columns === 0 ? (
          <p className={styles.empty}>This sheet is empty.</p>
        ) : (
          <table
            className={styles.sheet}
            ref={tableRef}
            style={{ '--row-height': `${rowHeight}px` } as React.CSSProperties}
          >
            <thead>
              <tr>
                <th className={styles.rowNumber} aria-label="Row" />
                {labels.map(label => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {before > 0 && <tr aria-hidden style={{ height: before }} />}
              {items.map(item => (
                <tr key={item.key}>
                  <th scope="row" className={styles.rowNumber}>
                    {item.index + 1}
                  </th>
                  {labels.map((label, column) => (
                    <td key={label}>{cellText(rows[item.index]?.[column] ?? null)}</td>
                  ))}
                </tr>
              ))}
              {after > 0 && <tr aria-hidden style={{ height: after }} />}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
