import { columnLabel, type SheetCell } from '../../../formats/xlsx'
import { type CellPosition, cellDetail } from './cell-selection'
import styles from './style.module.scss'

// The whole text of the selected cell, which the grid cuts to its column. It is announced as
// the selection moves, since a grid cell cannot carry the selection itself.
export const CellBar = ({ position, value }: { position: CellPosition; value: SheetCell }) => (
  <section className={styles.cellBar} aria-label="Selected cell" aria-live="polite">
    <span className={styles.cellName}>{`${columnLabel(position.column)}${position.row + 1}`}</span>
    <span className={styles.cellValue}>{cellDetail(value)}</span>
  </section>
)
