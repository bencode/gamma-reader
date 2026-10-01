import { useEffect, useMemo, useRef, useState } from 'react'
import type { StoredFileMetadata } from '../../../core/files'
import type { ReadingPositionProps } from '../../../core/reading-position'
import { readSpreadsheet, type Worksheet } from '../../../core/xlsx'
import { useReaderBinding } from '../../../shell/workspace-context'
import { readViewport } from '../reader-viewport'
import { SheetGrid } from './sheet-grid'
import styles from './style.module.scss'

type XlsxReaderProps = ReadingPositionProps & {
  document: StoredFileMetadata
  blob: Blob
  active: boolean
}

type SheetState =
  | { status: 'loading' }
  | { status: 'ready'; sheets: readonly Worksheet[] }
  | { status: 'error'; message: string }

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

export const XlsxReader = ({
  document,
  blob,
  active,
  defaultPosition,
  onPositionChange,
}: XlsxReaderProps) => {
  // Parsing is not free and both StrictMode and reopening a tab ask for the same workbook again.
  const workbook = useRef<{ id: string; revision: number; result: Promise<SheetState> }>(null)
  const [state, setState] = useState<SheetState>({ status: 'loading' })
  const [selected, setSelected] = useState(
    defaultPosition?.kind === 'sheet' ? defaultPosition.sheet : 0,
  )
  // The reader's own place, kept across a hidden tab, which loses its scroll offset.
  const place = useRef(defaultPosition?.kind === 'sheet' ? defaultPosition.scrollTop : 0)
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
      // A changed workbook starts over; the first one opens where the reader left it.
      if (cached) {
        setSelected(0)
        place.current = 0
      }
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
  // A saved sheet the workbook no longer has falls back to the first.
  const sheetIndex = sheets[selected] ? selected : 0
  const rows = sheets[sheetIndex]?.rows ?? []

  if (state.status === 'loading')
    return <div className="preview-state">Opening {document.path}…</div>
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
              aria-selected={index === sheetIndex}
              onClick={() => {
                setSelected(index)
                place.current = 0
                if (scrollRef.current) scrollRef.current.scrollTop = 0
                onPositionChange({ kind: 'sheet', sheet: index, scrollTop: 0 })
              }}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      )}
      <SheetGrid
        rows={rows}
        active={active}
        scrollTop={place.current}
        onScrollTopChange={scrollTop => {
          place.current = scrollTop
          onPositionChange({ kind: 'sheet', sheet: sheetIndex, scrollTop })
        }}
        scrollRef={scrollRef}
        tableRef={tableRef}
      />
    </div>
  )
}
