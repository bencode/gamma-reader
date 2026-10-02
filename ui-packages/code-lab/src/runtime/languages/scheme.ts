import type { BiwaSchemeRuntime, InterpreterInstance } from 'biwascheme'
import type { CodeLabExecutionResult, CodeLabOutput } from '../../types'
import { createConsoleCapture, installConsoleCapture } from '../format-value'
import type { LanguageRuntime, RuntimeProgress } from '../protocol'

let biwaScheme: BiwaSchemeRuntime | null = null
let interpreter: InterpreterInstance | null = null

const provideWorkerBrowserAliases = (): void => {
  const scope = globalThis as unknown as Record<string, unknown>
  scope.window ??= globalThis
  scope.document ??= {
    addEventListener: () => undefined,
    createElement: () => ({}),
    getElementsByTagName: () => [],
    querySelector: () => null,
    querySelectorAll: () => [],
  }
}

class LatexValue {
  constructor(readonly latex: string) {}
}

const defineLatexProcedure = (runtime: BiwaSchemeRuntime): void => {
  runtime.define_libfunc('latex', 1, 1, ([tex]) => {
    runtime.assert_string(tex)
    return new LatexValue(tex)
  })
}

// BiwaScheme catches every error and hands it to this callback; rethrowing lets runScheme report it.
const createInterpreter = (runtime: BiwaSchemeRuntime): InterpreterInstance =>
  new runtime.Interpreter(error => {
    throw error
  })

const initialize = async (progress: RuntimeProgress): Promise<void> => {
  if (biwaScheme && interpreter) return
  progress('Loading BiwaScheme…')
  provideWorkerBrowserAliases()
  const module = await import('biwascheme')
  biwaScheme = module.default
  defineLatexProcedure(biwaScheme)
  interpreter = createInterpreter(biwaScheme)
}

const formatSchemeValue = (runtime: BiwaSchemeRuntime, value: unknown): string | null => {
  if (value === undefined || value === null || value === runtime.undef) return null
  if (value === runtime.nil) return "'()"
  if (runtime.to_write) return runtime.to_write(value)
  const printable = value as { to_write_string?: () => string }
  if (typeof printable.to_write_string === 'function') return printable.to_write_string()
  return String(value)
}

const schemeValueOutput = (runtime: BiwaSchemeRuntime, value: unknown): CodeLabOutput | null => {
  if (value instanceof LatexValue) return { kind: 'latex', latex: value.latex }
  const text = formatSchemeValue(runtime, value)
  return text === null ? null : { kind: 'text', text }
}

const runScheme = async (
  source: string,
  progress: RuntimeProgress,
): Promise<CodeLabExecutionResult> => {
  await initialize(progress)
  if (!biwaScheme || !interpreter) throw new Error('BiwaScheme did not initialize')

  progress('Running Scheme…', 'running')
  const capture = createConsoleCapture()
  const restoreConsole = installConsoleCapture(capture)
  try {
    const value = interpreter.evaluate(source)
    const output = schemeValueOutput(biwaScheme, value)
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

export const schemeRuntime: LanguageRuntime = { run: runScheme }
