import { lazy, Suspense } from 'react'
import type { CodeLabCellSnapshot, CodeLabOutput } from '../../types'
import styles from './style.module.scss'

const HtmlOutput = lazy(() =>
  import('./html-output').then(module => ({ default: module.HtmlOutput })),
)

type CodeOutputProps = {
  snapshot: CodeLabCellSnapshot
}

const OutputValue = ({ output }: { output: CodeLabOutput }) => {
  if (output.kind === 'image') {
    return (
      <img
        className={styles.outputImage}
        src={`data:${output.mediaType};base64,${output.base64}`}
        alt="Generated output"
      />
    )
  }
  if (output.kind === 'html') {
    return (
      <div className={styles.richOutput}>
        <Suspense fallback={<span className={styles.muted}>Rendering output…</span>}>
          <HtmlOutput html={output.html} />
        </Suspense>
      </div>
    )
  }
  return <pre className={output.kind === 'stderr' ? styles.stderr : undefined}>{output.text}</pre>
}

export const CodeOutput = ({ snapshot }: CodeOutputProps) => {
  const running = snapshot.phase === 'loading' || snapshot.phase === 'running'
  const hasResult = snapshot.result !== null
  if (!running && !hasResult && snapshot.phase !== 'stopped') return null

  return (
    <div className={styles.output}>
      {running && (
        <div className={styles.progress} role="status">
          <span className={styles.progressDot} aria-hidden="true" />
          {snapshot.progress ?? 'Running…'}
        </div>
      )}
      {snapshot.phase === 'stopped' && <div className={styles.muted}>Execution stopped.</div>}
      {snapshot.result?.outputs.map(output => (
        <OutputValue key={output.kind} output={output} />
      ))}
      {snapshot.result?.error && (
        <pre className={styles.error} role="alert">
          {snapshot.result.error}
        </pre>
      )}
    </div>
  )
}
