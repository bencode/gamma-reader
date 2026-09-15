import type { BiwaSchemeRuntime, InterpreterInstance } from 'biwascheme'
import type { CodeLabExecutionResult } from '../../types'
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

const createInterpreter = (runtime: BiwaSchemeRuntime): InterpreterInstance =>
  new runtime.Interpreter(error => console.error('BiwaScheme interpreter error', error))

const initialize = async (progress: RuntimeProgress): Promise<void> => {
  if (biwaScheme && interpreter) return
  progress('Loading BiwaScheme…')
  provideWorkerBrowserAliases()
  const module = await import('biwascheme')
  biwaScheme = module.default
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
    const text = formatSchemeValue(biwaScheme, value)
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

export const schemeRuntime: LanguageRuntime = { run: runScheme }
