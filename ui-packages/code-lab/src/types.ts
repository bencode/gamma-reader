export type CodeLabLanguage = 'scheme' | 'clojure' | 'python' | 'typescript'

export type CodeLabCell = Readonly<{
  id: string
  language: CodeLabLanguage
  source: string
}>

export type CodeLabOutput =
  | Readonly<{ kind: 'stdout' | 'stderr' | 'text'; text: string }>
  | Readonly<{ kind: 'html'; html: string }>
  | Readonly<{ kind: 'image'; mediaType: 'image/png'; base64: string }>

export type CodeLabExecutionResult = Readonly<{
  outputs: readonly CodeLabOutput[]
  error: string | null
}>

export type CodeLabCellPhase = 'idle' | 'loading' | 'running' | 'succeeded' | 'failed' | 'stopped'

export type CodeLabCellSnapshot = Readonly<{
  id: string
  language: CodeLabLanguage
  source: string
  dirty: boolean
  phase: CodeLabCellPhase
  progress: string | null
  result: CodeLabExecutionResult | null
  canRun: boolean
  canStop: boolean
}>

export type CodeLabSessionSnapshot = Readonly<{
  dirty: boolean
}>

export type CodeLabSession = {
  getCells(): readonly CodeLabCell[]
  getCellSnapshot(cellId: string): CodeLabCellSnapshot
  getSessionSnapshot(): CodeLabSessionSnapshot
  subscribeCell(cellId: string, listener: () => void): () => void
  subscribeSession(listener: () => void): () => void
  updateCell(cellId: string, source: string): void
  runCell(cellId: string): Promise<void>
  stopCell(cellId: string): void
  resetCell(cellId: string): void
  markSaved(): void
  dispose(): void
}

export type CodeCellProps = {
  cellId: string
  session: CodeLabSession
}
