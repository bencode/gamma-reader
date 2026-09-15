import { Play, RotateCcw, Square } from 'lucide-react'
import { useCallback, useSyncExternalStore } from 'react'
import type { CodeCellProps, CodeLabLanguage } from '../../types'
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

export const CodeCell = ({ cellId, session }: CodeCellProps) => {
  const subscribe = useCallback(
    (listener: () => void) => session.subscribeCell(cellId, listener),
    [cellId, session],
  )
  const getSnapshot = useCallback(() => session.getCellSnapshot(cellId), [cellId, session])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const executing = snapshot.phase === 'loading' || snapshot.phase === 'running'
  const resetDisabled = executing || (!snapshot.dirty && snapshot.result === null)

  const run = useCallback(() => {
    void session
      .runCell(cellId)
      .catch(error => console.error(`Unable to start Code Lab cell ${cellId}`, error))
  }, [cellId, session])

  return (
    <section className={styles.cell} aria-label={`${languageLabels[snapshot.language]} code cell`}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <span className={styles.language}>{languageLabels[snapshot.language]}</span>
          <span className={styles.status} aria-live="polite">
            {snapshot.dirty && <span className={styles.dirtyDot} aria-hidden="true" />}
            {snapshot.dirty && 'Edited · '}
            {phaseLabels[snapshot.phase]}
          </span>
        </div>
        <div className={styles.actions}>
          <button type="button" disabled={resetDisabled} onClick={() => session.resetCell(cellId)}>
            <RotateCcw size={13} aria-hidden="true" />
            Reset
          </button>
          {snapshot.canStop ? (
            <button type="button" className={styles.stop} onClick={() => session.stopCell(cellId)}>
              <Square size={12} fill="currentColor" aria-hidden="true" />
              Stop
            </button>
          ) : (
            <button type="button" className={styles.run} disabled={!snapshot.canRun} onClick={run}>
              <Play size={13} fill="currentColor" aria-hidden="true" />
              Run
            </button>
          )}
        </div>
      </header>
      <div className={styles.editor}>
        <CodeEditor
          language={snapshot.language}
          source={snapshot.source}
          readOnly={executing}
          onChange={source => session.updateCell(cellId, source)}
          onRun={() => {
            if (snapshot.canRun) run()
          }}
        />
      </div>
      <CodeOutput snapshot={snapshot} />
    </section>
  )
}
