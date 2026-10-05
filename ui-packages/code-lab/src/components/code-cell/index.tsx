import { Play, Square } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import type { CodeCellProps, CodeLabLanguage } from '../../types'
import { useCodeLabContext } from '../code-lab-provider'
import { CodeEditor } from './code-editor'
import { CodeOutput } from './code-output'
import styles from './style.module.scss'

const languageLabels: Readonly<Record<CodeLabLanguage, string>> = {
  scheme: 'Scheme',
  clojure: 'Clojure',
  python: 'Python',
  typescript: 'TypeScript',
}

const phaseLabels = {
  idle: 'Ready',
  loading: 'Starting',
  running: 'Running',
  succeeded: 'Completed',
  failed: 'Failed',
  stopped: 'Stopped',
} as const

export const CodeCell = ({ cellId }: CodeCellProps) => {
  const { cells, onCellChange, onCellAdvance, currentCellId, onCellFocus, runtime } =
    useCodeLabContext()
  const executions = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot,
  )
  // A cell is numbered by its place among the cells, as the reader and the assistant call it.
  const number = cells.findIndex(cell => cell.id === cellId) + 1
  const cell = cells[number - 1]
  if (!cell) return null

  const currentExecution = executions.get(cellId)
  const execution = currentExecution?.language === cell.language ? currentExecution : undefined
  const executing = execution?.phase === 'loading' || execution?.phase === 'running'
  const busy = [...executions.values()].some(
    other =>
      other.language === cell.language && (other.phase === 'loading' || other.phase === 'running'),
  )
  const run = () => {
    if (!busy) void runtime.runCell(cell)
  }
  // As in a notebook: run, then go on to the next cell, where the host decides what that is.
  const runAndAdvance = () => {
    run()
    onCellAdvance?.(cellId)
  }
  const label = languageLabels[cell.language]

  return (
    <section
      className={styles.cell}
      aria-label={`${label} code cell ${number}`}
      data-current={currentCellId === cellId || undefined}
      onFocus={() => onCellFocus?.(cellId)}
    >
      <header className={styles.header}>
        <div className={styles.identity}>
          <span className={styles.number}>#{number}</span>
          <span className={styles.language}>{label}</span>
          <span className={styles.status} aria-live="polite">
            {busy && !executing ? `Waiting for ${label}` : phaseLabels[execution?.phase ?? 'idle']}
          </span>
        </div>
        <div className={styles.actions}>
          {executing ? (
            <button type="button" className={styles.stop} onClick={() => runtime.stopCell(cellId)}>
              <Square size={12} fill="currentColor" aria-hidden="true" />
              Stop
            </button>
          ) : (
            <button
              type="button"
              className={styles.run}
              disabled={busy}
              title="Run code (⌘/Ctrl+Enter) · Run and go on (Shift+Enter)"
              onClick={run}
            >
              <Play size={13} fill="currentColor" aria-hidden="true" />
              Run
            </button>
          )}
        </div>
      </header>
      <div className={styles.editor}>
        <CodeEditor
          language={cell.language}
          source={cell.source}
          readOnly={!onCellChange || executing}
          onChange={source => onCellChange?.(cellId, source)}
          onRun={run}
          onRunAndAdvance={runAndAdvance}
        />
      </div>
      <CodeOutput execution={execution} source={cell.source} />
    </section>
  )
}
