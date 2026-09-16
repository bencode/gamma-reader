import { CodeCell, type CodeLabCell, CodeLabProvider } from '@gamma-reader/code-lab'
import { Activity, useState } from 'react'
import styles from './app.module.scss'

const basicCell: CodeLabCell = {
  id: 'double',
  language: 'typescript',
  source: 'const values = [1, 2, 3]\nvalues.map(value => value * 2)',
}

export const BasicExample = () => {
  const [cell, setCell] = useState(basicCell)
  return (
    <section className={styles.demo} aria-label="A single controlled cell">
      <h2>Start with one cell</h2>
      <p>
        Edit the numbers, then run the code. The host owns the source; the component owns execution.
      </p>
      <CodeLabProvider cells={[cell]} onCellChange={(_id, source) => setCell({ ...cell, source })}>
        <CodeCell cellId={cell.id} />
      </CodeLabProvider>
    </section>
  )
}

const initialCells: readonly CodeLabCell[] = [
  { id: 'definition', language: 'typescript', source: 'globalThis.answer = 21' },
  { id: 'usage', language: 'typescript', source: 'globalThis.answer * 2' },
]

export const ControlledExample = () => {
  const [cells, setCells] = useState(initialCells)
  const [visible, setVisible] = useState(true)
  const [readOnly, setReadOnly] = useState(false)
  const updateCell = (id: string, source: string) =>
    setCells(current => current.map(cell => (cell.id === id ? { ...cell, source } : cell)))

  return (
    <section className={styles.demo} aria-label="Controlled cells">
      <h2>Let the host take control</h2>
      <p>
        Run the definition, then use it below. These cells share their own TypeScript environment.
        External edits change the source without running it. Hiding the view preserves execution.
      </p>
      <div className={styles.demoControls}>
        <button
          type="button"
          onClick={() => {
            const id = crypto.randomUUID()
            setCells(current => [
              ...current,
              { id, language: 'typescript', source: 'globalThis.answer' },
            ])
          }}
        >
          Add cell
        </button>
        <button
          type="button"
          disabled={!cells.length}
          onClick={() => {
            const first = cells[0]
            if (first) updateCell(first.id, 'globalThis.answer = 100')
          }}
        >
          Update from outside
        </button>
        <button
          type="button"
          aria-expanded={visible}
          onClick={() => setVisible(current => !current)}
        >
          {visible ? 'Hide cells' : 'Show cells'}
        </button>
        <label>
          <input
            type="checkbox"
            checked={readOnly}
            onChange={event => setReadOnly(event.target.checked)}
          />
          Read only
        </label>
      </div>
      <CodeLabProvider cells={cells} onCellChange={readOnly ? undefined : updateCell}>
        <Activity mode={visible ? 'visible' : 'hidden'}>
          <div className={styles.cells}>
            {cells.map((cell, index) => (
              <div key={cell.id} className={styles.hostCell}>
                <div className={styles.hostCellHeader}>
                  <span>Cell {index + 1}</span>
                  <button
                    type="button"
                    aria-label={`Remove cell ${index + 1}`}
                    onClick={() =>
                      setCells(current => current.filter(candidate => candidate.id !== cell.id))
                    }
                  >
                    Remove
                  </button>
                </div>
                <CodeCell cellId={cell.id} />
              </div>
            ))}
            {!cells.length && <p>Add a cell to start again.</p>}
          </div>
        </Activity>
      </CodeLabProvider>
      <details className={styles.hostData}>
        <summary>Host data</summary>
        <pre>{JSON.stringify(cells, null, 2)}</pre>
      </details>
    </section>
  )
}
