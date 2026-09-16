import type { ReactNode } from 'react'

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

export type CodeLabProviderProps = {
  cells: readonly CodeLabCell[]
  onCellChange?: (cellId: string, source: string) => void
  children: ReactNode
}

export type CodeCellProps = {
  cellId: string
}
