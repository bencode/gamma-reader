import { lazy, Suspense } from 'react'
import type { CellExecution } from '../../code-lab-runtime'
import type { CodeLabOutput } from '../../types'
import styles from './style.module.scss'

const HtmlOutput = lazy(() =>
  import('./html-output').then(module => ({ default: module.HtmlOutput })),
)

type CodeOutputProps = {
  execution: CellExecution | undefined
  source: string
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

export const CodeOutput = ({ execution, source }: CodeOutputProps) => {
  if (!execution) return null
  const running = execution.phase === 'loading' || execution.phase === 'running'
  const outdated = execution.result !== null && execution.source !== source
  const hasOutput =
    execution.result && (execution.result.outputs.length > 0 || execution.result.error)
  if (!running && !hasOutput && !outdated && execution.phase !== 'stopped') return null

  return (
    <div className={styles.output}>
      {outdated && (
        <div className={styles.outdated} role="status">
          Code changed · Run again
        </div>
      )}
      {running && (
        <div className={styles.progress} role="status">
          <span className={styles.progressDot} aria-hidden="true" />
          {execution.progress ?? 'Running…'}
        </div>
      )}
      {execution.phase === 'stopped' && (
        <div className={styles.muted}>
          Execution stopped. The language environment was cleared; run prerequisite cells again.
        </div>
      )}
      {execution.result?.outputs.map(output => (
        <OutputValue key={output.kind} output={output} />
      ))}
      {execution.result?.error && (
        <pre className={styles.error} role="alert">
          {execution.result.error}
        </pre>
      )}
    </div>
  )
}
