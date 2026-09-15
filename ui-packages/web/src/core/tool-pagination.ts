import { LocalToolError, type ReadRange, type SourceLineRange } from './local-tool-types'

export const maximumResultBytes = 16 * 1024
const encoder = new TextEncoder()
export const resultBytes = (value: unknown) => encoder.encode(JSON.stringify(value)).length
export const fitsResult = (value: unknown) => resultBytes(value) <= maximumResultBytes

export type Continuation =
  | { operation: 'list'; name: string; index: number }
  | {
      operation: 'search'
      query: string
      filter: string
      fileId: string
      revision: number
      page: number
      match: number
    }
  | {
      operation: 'read'
      fileId: string
      revision: number
      range: ReadRange
      page: number
      offset: number
    }
  | {
      operation: 'read-active-source'
      fileId: string
      version: string
      range: SourceLineRange
      offset: number
    }

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null
const integer = (value: unknown, minimum: number) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
export const validRange = (value: unknown): value is ReadRange =>
  record(value) &&
  (value.unit === 'line' || value.unit === 'page') &&
  integer(value.start, 1) &&
  integer(value.end, 1) &&
  Number(value.end) >= Number(value.start)
export const sameRange = (left: ReadRange, right: ReadRange) =>
  left.unit === right.unit && left.start === right.start && left.end === right.end

const validContinuation = (value: unknown): value is Continuation => {
  if (!record(value)) return false
  if (value.operation === 'list') return typeof value.name === 'string' && integer(value.index, 0)
  if (value.operation === 'read-active-source')
    return (
      typeof value.fileId === 'string' &&
      typeof value.version === 'string' &&
      value.version.length > 0 &&
      validRange(value.range) &&
      value.range.unit === 'line' &&
      integer(value.offset, 0)
    )
  if (typeof value.fileId !== 'string' || !integer(value.revision, 1) || !integer(value.page, 1))
    return false
  if (value.operation === 'search')
    return (
      typeof value.query === 'string' && typeof value.filter === 'string' && integer(value.match, 0)
    )
  return value.operation === 'read' && validRange(value.range) && integer(value.offset, 0)
}

export const encodeCursor = (cursor: Continuation) =>
  btoa(String.fromCharCode(...encoder.encode(JSON.stringify(cursor))))

export const decodeCursor = (token?: string) => {
  if (token === undefined) return null
  try {
    if (token.length > 16 * 1024) throw new LocalToolError('Cursor is too long.')
    const value: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        Uint8Array.from(atob(token), char => char.charCodeAt(0)),
      ),
    )
    if (!validContinuation(value)) throw new LocalToolError('Invalid cursor fields.')
    return value
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause
    throw new LocalToolError('Invalid cursor. Restart the call without a cursor.', { cause })
  }
}

export const changedFile = () =>
  new LocalToolError('File changed. Restart the call without a cursor.')
export const changedSource = () =>
  new LocalToolError('Source changed. Call read_active_source again without a cursor.')
export const mismatchedCursor = () =>
  new LocalToolError('Cursor does not match this request. Restart without a cursor.')

export const boundedText = (text: string, maximumBytes: number) => {
  const bytes = encoder.encode(text)
  let end = Math.min(Math.max(0, maximumBytes), bytes.length)
  while (end > 0 && end < bytes.length && ((bytes[end] ?? 0) & 0xc0) === 0x80) end--
  return new TextDecoder().decode(bytes.subarray(0, end))
}

export const firstLines = (text: string, limit: number) => {
  let end = -1
  for (let index = 0; index < limit; index++) {
    end = text.indexOf('\n', end + 1)
    if (end === -1) return text
  }
  return text.slice(0, end + 1)
}
