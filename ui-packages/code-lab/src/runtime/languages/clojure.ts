import type { CodeLabExecutionResult } from '../../types'
import { createConsoleCapture, installConsoleCapture } from '../format-value'
import type { LanguageRuntime, RuntimeProgress } from '../protocol'

const scittleVersion = '0.8.33'
const scittleUrl = `https://cdn.jsdelivr.net/npm/scittle@${scittleVersion}/dist/scittle.js`

type Scittle = {
  core: {
    eval_string(source: string): unknown
  }
}

let scittle: Scittle | null = null
let initialization: Promise<Scittle> | null = null

const getGlobalScittle = (): Scittle | null => {
  const candidate = (globalThis as typeof globalThis & { scittle?: Scittle }).scittle
  return candidate ?? null
}

const initialize = async (progress: RuntimeProgress): Promise<Scittle> => {
  if (scittle) return scittle
  if (initialization) return initialization

  initialization = (async () => {
    progress('Downloading Scittle…')
    const response = await fetch(scittleUrl)
    if (!response.ok) throw new Error(`Unable to load Scittle (${response.status})`)
    const source = await response.text()
    const scope = globalThis as unknown as Record<string, unknown>
    scope.window ??= globalThis
    const loadScittle = new Function(`${source}\n//# sourceURL=${scittleUrl}`)
    loadScittle.call(globalThis)
    const runtime = getGlobalScittle()
    if (!runtime) throw new Error('Scittle loaded without exposing its runtime')
    scittle = runtime
    return runtime
  })()

  try {
    return await initialization
  } catch (error) {
    initialization = null
    throw error
  }
}

const runClojure = async (
  source: string,
  progress: RuntimeProgress,
): Promise<CodeLabExecutionResult> => {
  const runtime = await initialize(progress)
  progress('Running Clojure…', 'running')
  const capture = createConsoleCapture()
  const restoreConsole = installConsoleCapture(capture)
  try {
    const value = runtime.core.eval_string(`(pr-str (do\n${source}\n))`)
    const text = typeof value === 'string' && value !== 'nil' ? value : null
    return {
      outputs: [...capture.outputs(), ...(text === null ? [] : [{ kind: 'text' as const, text }])],
      error: null,
    }
  } catch (error) {
    return {
      outputs: capture.outputs(),
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    }
  } finally {
    restoreConsole()
  }
}

export const clojureRuntime: LanguageRuntime = { run: runClojure }
