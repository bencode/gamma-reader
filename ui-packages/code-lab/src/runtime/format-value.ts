import type { CodeLabOutput } from '../types'

export const formatValue = (value: unknown): string => {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'bigint') return `${value}n`
  if (typeof value === 'function' || typeof value === 'symbol') return value.toString()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  try {
    const serialized = JSON.stringify(
      value,
      (_key, nestedValue: unknown) => {
        if (typeof nestedValue === 'bigint') return `${nestedValue}n`
        if (nestedValue instanceof Map) return Object.fromEntries(nestedValue)
        if (nestedValue instanceof Set) return Array.from(nestedValue)
        return nestedValue
      },
      2,
    )
    return serialized ?? String(value)
  } catch (error) {
    console.error('Unable to serialize a runtime value', error)
    return String(value)
  }
}

export type ConsoleCapture = {
  runtimeConsole: Pick<Console, 'log' | 'info' | 'debug' | 'warn' | 'error'>
  // Appends to stdout as written, for runtimes that print in pieces rather than lines.
  write: (text: string) => void
  outputs(): readonly CodeLabOutput[]
}

export const createConsoleCapture = (): ConsoleCapture => {
  let stdout = ''
  const stderr: string[] = []
  const line = (values: readonly unknown[]) =>
    values.map(value => (typeof value === 'string' ? value : formatValue(value))).join(' ')
  const write = (text: string) => {
    stdout += text
  }
  const log = (...values: unknown[]) => write(`${line(values)}\n`)

  return {
    runtimeConsole: {
      log,
      info: log,
      debug: log,
      warn: (...values) => stderr.push(line(values)),
      error: (...values) => stderr.push(line(values)),
    },
    write,
    outputs: () => [
      ...(stdout ? [{ kind: 'stdout' as const, text: stdout }] : []),
      ...(stderr.length > 0 ? [{ kind: 'stderr' as const, text: `${stderr.join('\n')}\n` }] : []),
    ],
  }
}

export const installConsoleCapture = (capture: ConsoleCapture): (() => void) => {
  const original = {
    log: console.log,
    info: console.info,
    debug: console.debug,
    warn: console.warn,
    error: console.error,
  }
  Object.assign(console, capture.runtimeConsole)
  return () => Object.assign(console, original)
}
