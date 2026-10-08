import { useMemo, useRef } from 'react'
import { isTabular, parseCsv } from '../../formats/csv'
import { useReaderBinding } from '../workspace/workspace-context'
import { MarkdownReader } from './markdown-reader'
import { readViewport } from './reader-viewport'
import type { TextReaderProps } from './text-reader'
import { SheetGrid } from './xlsx-reader/sheet-grid'
import styles from './xlsx-reader/style.module.scss'

// The grid shows the draft, so an edit in Source reaches it as the reader types.
const CsvGrid = ({
  document,
  rows,
  active,
  defaultPosition,
  onPositionChange,
}: Omit<TextReaderProps, 'content' | 'files'> & { rows: readonly string[][] }) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  // The reader's own place, kept across a hidden tab, which loses its scroll offset.
  const place = useRef(defaultPosition?.kind === 'sheet' ? defaultPosition.scrollTop : 0)
  const binding = useMemo(
    () => ({
      fileId: document.id,
      getViewport: () => readViewport(tableRef.current, scrollRef.current),
    }),
    [document.id],
  )
  useReaderBinding(binding, active)
  return (
    <div className={`reader-content ${styles.reader}`}>
      <SheetGrid
        rows={rows}
        active={active}
        scrollTop={place.current}
        onScrollTopChange={scrollTop => {
          place.current = scrollTop
          onPositionChange({ kind: 'sheet', sheet: 0, scrollTop })
        }}
        scrollRef={scrollRef}
        tableRef={tableRef}
      />
    </div>
  )
}

export const CsvReader = (props: TextReaderProps) => {
  const rows = useMemo(() => parseCsv(props.content), [props.content])
  // A file with a single column throughout is a list or prose, not a table.
  return isTabular(rows) ? <CsvGrid {...props} rows={rows} /> : <MarkdownReader {...props} />
}
