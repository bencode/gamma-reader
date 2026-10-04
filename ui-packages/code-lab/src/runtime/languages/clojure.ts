import type { CodeLabExecutionResult, CodeLabOutput } from '../../types'
import { createConsoleCapture, installConsoleCapture } from '../format-value'
import type { LanguageRuntime, RuntimeProgress } from '../protocol'

// Scittle Kitchen builds its runtime and plugins together, so a plugin loads only beside the runtime of its own release.
const scittleKitchenUrl = 'https://g.upivot.cn/bcd/gamma-reader/scittle-kitchen/0.8.33-105/'
const scittleUrl = `${scittleKitchenUrl}scittle.js`
const emmyUrl = `${scittleKitchenUrl}scittle.emmy.js`

// A plugin reaches the runtime through these top-level variables, which a script tag would leave global.
const shareRuntimeScope = 'globalThis.shadow$provide = shadow$provide; globalThis.$APP = $APP;'

type Scittle = {
  core: {
    eval_string(source: string): unknown
  }
}

type ClojureRuntime = Readonly<{
  evaluate(source: string): unknown
  format(value: unknown): unknown
}>

// Defined in the default `user` namespace; cells that switch namespaces call it as `user/latex`.
const latexHelper = `(defn latex [tex]
  (when-not (string? tex) (throw (js/Error. (str "latex expects a string, got " (pr-str tex)))))
  #js {:toLatex (fn [] tex)})`

// A cell runs as top-level forms, as at a REPL, so a require takes effect for the forms after it.
// Its last value is then formatted: values carrying toLatex() stay JS objects for the formula output;
// everything else is printed.
const formatValue = `(fn [value]
  (if (and (some? value) (fn? (.-toLatex value)) (string? (.toLatex value))) value (pr-str value)))`

let clojure: ClojureRuntime | null = null
let initialization: Promise<ClojureRuntime> | null = null
let emmyLoading: Promise<void> | null = null

const loadScript = async (url: string, name: string, epilogue = ''): Promise<void> => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Unable to load ${name} (${response.status})`)
  const source = await response.text()
  new Function(`${source}\n;${epilogue}\n//# sourceURL=${url}`).call(globalThis)
}

const usesEmmy = (source: string): boolean => /\bemmy\./.test(source)

const getGlobalScittle = (): Scittle | null => {
  const candidate = (globalThis as typeof globalThis & { scittle?: Scittle }).scittle
  return candidate ?? null
}

const initialize = async (progress: RuntimeProgress): Promise<ClojureRuntime> => {
  if (clojure) return clojure
  if (initialization) return initialization

  initialization = (async () => {
    progress('Downloading Scittle…')
    const scope = globalThis as unknown as Record<string, unknown>
    scope.window ??= globalThis
    await loadScript(scittleUrl, 'Scittle', shareRuntimeScope)
    const runtime = getGlobalScittle()
    if (!runtime) throw new Error('Scittle loaded without exposing its runtime')
    runtime.core.eval_string(latexHelper)
    const format = runtime.core.eval_string(formatValue) as (value: unknown) => unknown
    clojure = { evaluate: source => runtime.core.eval_string(source), format }
    return clojure
  })()

  try {
    return await initialization
  } catch (error) {
    initialization = null
    throw error
  }
}

const loadEmmy = (progress: RuntimeProgress): Promise<void> => {
  emmyLoading ??= (async () => {
    progress('Downloading Emmy…')
    await loadScript(emmyUrl, 'Emmy')
  })().catch(error => {
    emmyLoading = null
    throw error
  })
  return emmyLoading
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
  if (usesEmmy(source)) await loadEmmy(progress)
  progress('Running Clojure…', 'running')
  const capture = createConsoleCapture()
  const restoreConsole = installConsoleCapture(capture)
  try {
    const output = clojureValueOutput(runtime.format(runtime.evaluate(source)))
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
