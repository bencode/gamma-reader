import { useVirtualizer } from '@tanstack/react-virtual'
import {
  type CSSProperties,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react'
import {
  type CellRange,
  cellText,
  clampColumns,
  columnLabel,
  type SheetRow,
} from '../../../formats/xlsx'
import { CellBar } from './cell-bar'
import { type CellPosition, moveSelection } from './cell-selection'
import styles from './style.module.scss'

// The virtualizer places rows by this height, so the stylesheet has to use the same number.
const rowHeight = 30

const between = (start: number, end: number) =>
  Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index)

// A merged block reads as one cell: each cell drops the borders it shares with the block, and
// the value in the top-left cell runs across the block's shown columns. A block reaching past
// the grid keeps the grid's own edge. Keyed by "row:column".
const mergedCells = (merges: readonly CellRange[], rows: number, columns: number) =>
  new Map(
    merges.flatMap(merge => {
      const lastRow = Math.min(merge.endRow, rows)
      const lastColumn = Math.min(merge.endColumn, columns)
      return between(merge.startRow, lastRow).flatMap(row =>
        between(merge.startColumn, lastColumn).map(column => {
          const anchor = row === merge.startRow && column === merge.startColumn
          const className = [
            anchor && styles.mergedAnchor,
            column < lastColumn && styles.mergedRight,
            row < lastRow && styles.mergedBottom,
          ]
          return [
            `${row}:${column}`,
            {
              className: className.filter(Boolean).join(' '),
              span: anchor ? lastColumn - column + 1 : undefined,
            },
          ] as const
        }),
      )
    }),
  )

type SheetGridProps = {
  rows: readonly SheetRow[]
  merges?: readonly CellRange[]
  active: boolean
  // Where the grid returns to when it is shown; a hidden tab loses its scroll offset.
  scrollTop: number
  onScrollTopChange: (scrollTop: number) => void
  scrollRef: RefObject<HTMLDivElement | null>
  tableRef: RefObject<HTMLTableElement | null>
}

export const SheetGrid = ({
  rows,
  merges,
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
  const merged = useMemo(
    () => mergedCells(merges ?? [], rows.length, columns),
    [merges, rows.length, columns],
  )
  const [selection, setSelection] = useState<{
    rows: readonly SheetRow[]
    position: CellPosition
  } | null>(null)
  // Another sheet, or an edit to a CSV draft, starts with nothing selected.
  const position = selection?.rows === rows ? selection.position : null

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    // Rows scrolled to by key stop below the sticky header.
    scrollPaddingStart: rowHeight,
    overscan: 12,
  })
  const items = virtualizer.getVirtualItems()
  const before = items[0]?.start ?? 0
  const after = virtualizer.getTotalSize() - (items[items.length - 1]?.end ?? 0)

  useLayoutEffect(() => {
    if (!active || !scrollRef.current) return
    scrollRef.current.scrollTop = scrollTop
  }, [active, scrollRef, scrollTop])

  // The row is scrolled to by key; this brings the column into view as well.
  useEffect(() => {
    if (!position) return
    const { row, column } = position
    scrollRef.current
      ?.querySelector(`td[data-row="${row}"][data-column="${column}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [position, scrollRef])

  return (
    <>
      {hidden > 0 && (
        <p className={styles.notice}>
          Showing the first {columns} of {columns + hidden} columns. The assistant reads them all.
        </p>
      )}
      {position && (
        <CellBar position={position} value={rows[position.row]?.[position.column] ?? null} />
      )}
      <section
        className={styles.scroll}
        ref={scrollRef}
        aria-label="Sheet"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region has to take focus for a keyboard to scroll it, and here the arrow keys also move the selected cell
        tabIndex={0}
        onScroll={event => {
          if (active) onScrollTopChange(event.currentTarget.scrollTop)
        }}
        onClick={event => {
          const cell = (event.target as Element).closest('td')?.dataset
          if (cell?.row === undefined || cell.column === undefined) return
          setSelection({ rows, position: { row: Number(cell.row), column: Number(cell.column) } })
        }}
        onKeyDown={event => {
          const next = columns ? moveSelection(position, event.key, rows.length, columns) : null
          if (!next) return
          event.preventDefault()
          setSelection({ rows, position: next })
          virtualizer.scrollToIndex(next.row)
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
                  {labels.map((label, column) => {
                    const text = cellText(rows[item.index]?.[column] ?? null)
                    const merge = merged.get(`${item.index + 1}:${column + 1}`)
                    const selected = position?.row === item.index && position.column === column
                    const className = [merge?.className, selected && styles.selected]
                    return (
                      <td
                        key={label}
                        data-row={item.index}
                        data-column={column}
                        className={className.filter(Boolean).join(' ') || undefined}
                        style={
                          merge?.span ? ({ '--span': merge.span } as CSSProperties) : undefined
                        }
                      >
                        {merge?.span ? <span>{text}</span> : text}
                      </td>
                    )
                  })}
                </tr>
              ))}
              {after > 0 && <tr aria-hidden style={{ height: after }} />}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}
