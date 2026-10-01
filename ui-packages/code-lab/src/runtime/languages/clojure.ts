import type { CodeLabExecutionResult, CodeLabOutput } from '../../types'
import { createConsoleCapture, installConsoleCapture } from '../format-value'
import type { LanguageRuntime, RuntimeProgress } from '../protocol'

const scittleVersion = '0.8.33'
const scittleUrl = `https://cdn.jsdelivr.net/npm/scittle@${scittleVersion}/dist/scittle.js`

type Scittle = {
  core: {
    eval_string(source: string): unknown
  }
}

// Defined in the default `user` namespace; cells that switch namespaces call it as `user/latex`.
const latexHelper = `(defn latex [tex]
  (when-not (string? tex) (throw (js/Error. (str "latex expects a string, got " (pr-str tex)))))
  #js {:toLatex (fn [] tex)})`

// Values carrying toLatex() stay JS objects for the formula output; everything else is printed.
const wrapCell = (source: string): string => `(let [value (do
${source}
)]
  (if (and (some? value) (fn? (.-toLatex value)) (string? (.toLatex value))) value (pr-str value)))`

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
    runtime.core.eval_string(latexHelper)
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

const clojureValueOutput = (value: unknown): CodeLabOutput | null => {
  if (typeof value === 'string') return value === 'nil' ? null : { kind: 'text', text: value }
  return { kind: 'latex', latex: (value as { toLatex: () => string }).toLatex() }
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
    const output = clojureValueOutput(runtime.core.eval_string(wrapCell(source)))
    return {
      outputs: [...capture.outputs(), ...(output === null ? [] : [output])],
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
