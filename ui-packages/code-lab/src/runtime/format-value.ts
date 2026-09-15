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
  outputs(): readonly CodeLabOutput[]
}

export const createConsoleCapture = (): ConsoleCapture => {
  const stdout: string[] = []
  const stderr: string[] = []
  const append = (target: string[], values: readonly unknown[]): void => {
    target.push(
      values.map(value => (typeof value === 'string' ? value : formatValue(value))).join(' '),
    )
  }

  return {
    runtimeConsole: {
      log: (...values) => append(stdout, values),
      info: (...values) => append(stdout, values),
      debug: (...values) => append(stdout, values),
      warn: (...values) => append(stderr, values),
      error: (...values) => append(stderr, values),
    },
    outputs: () => [
      ...(stdout.length > 0 ? [{ kind: 'stdout' as const, text: `${stdout.join('\n')}\n` }] : []),
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
