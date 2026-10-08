import { useVirtualizer } from '@tanstack/react-virtual'
import { type RefObject, useLayoutEffect, useMemo } from 'react'
import { cellText, clampColumns, columnLabel, type SheetRow } from '../../../formats/xlsx'
import styles from './style.module.scss'

// The virtualizer places rows by this height, so the stylesheet has to use the same number.
const rowHeight = 30

type SheetGridProps = {
  rows: readonly SheetRow[]
  active: boolean
  // Where the grid returns to when it is shown; a hidden tab loses its scroll offset.
  scrollTop: number
  onScrollTopChange: (scrollTop: number) => void
  scrollRef: RefObject<HTMLDivElement | null>
  tableRef: RefObject<HTMLTableElement | null>
}

export const SheetGrid = ({
  rows,
  active,
  scrollTop,
  onScrollTopChange,
  scrollRef,
  tableRef,
}: SheetGridProps) => {
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

  useLayoutEffect(() => {
    if (!active || !scrollRef.current) return
    scrollRef.current.scrollTop = scrollTop
  }, [active, scrollRef, scrollTop])

  return (
    <>
      {hidden > 0 && (
        <p className={styles.notice}>
          Showing the first {columns} of {columns + hidden} columns. The assistant reads them all.
        </p>
      )}
      <div
        className={styles.scroll}
        ref={scrollRef}
        onScroll={event => {
          if (active) onScrollTopChange(event.currentTarget.scrollTop)
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
    </>
  )
}
