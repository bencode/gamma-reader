import { transform } from 'sucrase'
import type { CodeLabExecutionResult, CodeLabOutput } from '../../types'
import type { ConsoleCapture } from '../format-value'
import { createConsoleCapture, formatValue } from '../format-value'
import type { LanguageRuntime, RuntimeProgress } from '../protocol'

const statementStart =
  /^(if|for|while|switch|case|break|continue|return|let|const|var|function|class|try|catch|finally|throw|import|export|do|else|interface|type|enum)\b/
const chainContinuation = /^\??\./
const esmBaseUrl = 'https://esm.sh'
const importAliases: Readonly<Record<string, string>> = {
  ramda: `${esmBaseUrl}/ramda`,
  remeda: `${esmBaseUrl}/remeda`,
  lodash: `${esmBaseUrl}/lodash-es`,
  'date-fns': `${esmBaseUrl}/date-fns`,
  zod: `${esmBaseUrl}/zod`,
  immer: `${esmBaseUrl}/immer`,
}

const isStatementLike = (line: string): boolean => {
  const value = line.trim()
  return (
    value.length === 0 ||
    value.endsWith(';') ||
    value.endsWith('{') ||
    value.endsWith('}') ||
    value.startsWith('//') ||
    value.startsWith('/*') ||
    value.startsWith(')') ||
    value.startsWith('}') ||
    value.startsWith(']') ||
    statementStart.test(value)
  )
}

const splitFinalExpression = (source: string): { body: string; expression: string | null } => {
  const lines = source.split('\n')
  let end = lines.length - 1
  while (end >= 0 && lines[end]?.trim() === '') end -= 1
  const lastLine = lines[end]
  if (end < 0 || lastLine === undefined || isStatementLike(lastLine)) {
    return { body: source, expression: null }
  }

  let start = end
  while (start > 0 && chainContinuation.test(lines[start]?.trim() ?? '')) start -= 1
  const firstLine = lines[start]
  if (firstLine === undefined || isStatementLike(firstLine)) {
    return { body: source, expression: null }
  }

  return {
    body: lines.slice(0, start).join('\n'),
    expression: lines
      .slice(start, end + 1)
      .join('\n')
      .replace(/^[\s;]+/, ''),
  }
}

const importLibrary = async (specifier: string): Promise<unknown> => {
  const url = /^https?:\/\//.test(specifier) ? specifier : importAliases[specifier]
  if (!url) throw new Error(`Unknown $import alias: ${specifier}`)
  return import(/* @vite-ignore */ url)
}

const richValueOutput = (value: unknown): CodeLabOutput | null => {
  if (value === undefined) return null
  if (value !== null && typeof value === 'object') {
    const richValue = value as { toHtml?: () => unknown }
    if (typeof richValue.toHtml === 'function') {
      const html = richValue.toHtml()
      if (typeof html === 'string') return { kind: 'html', html }
    }
  }
  return { kind: 'text', text: formatValue(value) }
}

const runTypeScript = async (
  source: string,
  progress: RuntimeProgress,
): Promise<CodeLabExecutionResult> => {
  progress('Compiling TypeScript…')
  const capture = createConsoleCapture()
  try {
    const { body, expression } = splitFinalExpression(source)
    const executable = expression ? `${body}\n;return (${expression});` : body
    const wrapped = `(async () => {\n${executable}\n})()`
    const compiled = transform(wrapped, {
      transforms: ['typescript'],
      disableESTransforms: true,
    }).code
    progress('Running TypeScript…', 'running')
    const execute = new Function('console', '$import', `return ${compiled};`) as (
      console: ConsoleCapture['runtimeConsole'],
      importer: typeof importLibrary,
    ) => Promise<unknown>
    const value = await execute(capture.runtimeConsole, importLibrary)
    const output = richValueOutput(value)
    return {
      outputs: [...capture.outputs(), ...(output ? [output] : [])],
      error: null,
    }
  } catch (error) {
    return {
      outputs: capture.outputs(),
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    }
  }
}

export const typescriptRuntime: LanguageRuntime = { run: runTypeScript }
