import type { CodeLabExecutionResult, CodeLabLanguage } from '../types'

export type RuntimeRunRequest = Readonly<{
  type: 'run'
  requestId: string
  language: CodeLabLanguage
  source: string
}>

export type RuntimeRequest = RuntimeRunRequest

export type RuntimeProgressResponse = Readonly<{
  type: 'progress'
  requestId: string
  message: string
  phase: 'loading' | 'running'
}>

export type RuntimeResultResponse = Readonly<{
  type: 'result'
  requestId: string
  result: CodeLabExecutionResult
}>

export type RuntimeFailureResponse = Readonly<{
  type: 'failure'
  requestId: string
  error: string
}>

export type RuntimeResponse =
  | RuntimeProgressResponse
  | RuntimeResultResponse
  | RuntimeFailureResponse

export type RuntimeProgress = (message: string, phase?: 'loading' | 'running') => void

export type LanguageRuntime = {
  run(source: string, progress: RuntimeProgress): Promise<CodeLabExecutionResult>
}
