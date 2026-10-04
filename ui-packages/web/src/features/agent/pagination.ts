import { LocalToolError, type ReadRange } from './tool-types'

export const maximumResultBytes = 16 * 1024
const encoder = new TextEncoder()
export const resultBytes = (value: unknown) => encoder.encode(JSON.stringify(value)).length
export const fitsResult = (value: unknown) => resultBytes(value) <= maximumResultBytes

export const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null
export const integer = (value: unknown, minimum: number) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
export const validRange = (value: unknown): value is ReadRange =>
  record(value) &&
  (value.unit === 'line' || value.unit === 'page') &&
  integer(value.start, 1) &&
  integer(value.end, 1) &&
  Number(value.end) >= Number(value.start)
export const sameRange = (left: ReadRange, right: ReadRange) =>
  left.unit === right.unit && left.start === right.start && left.end === right.end

export const encodeCursor = (cursor: object) =>
  btoa(String.fromCharCode(...encoder.encode(JSON.stringify(cursor))))

export const decodeCursor = <T>(
  token: string | undefined,
  validate: (value: unknown) => value is T,
) => {
  // A model may send an empty cursor to mean none.
  if (token === undefined || !token.trim()) return null
  try {
    if (token.length > 16 * 1024) throw new LocalToolError('Cursor is too long.')
    const value: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        Uint8Array.from(atob(token), char => char.charCodeAt(0)),
      ),
    )
    if (!validate(value)) throw new LocalToolError('Invalid cursor fields.')
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

const maximumEntries = 100

// A request named by its fields in a fixed order, so a model that reorders or drops an empty
// field still continues the same request.
const requestHash = (operation: string, request: Record<string, unknown>) => {
  const canonical = JSON.stringify([
    operation,
    ...Object.keys(request)
      .filter(key => request[key] !== undefined && request[key] !== '')
      .sort()
      .map(key => [key, request[key]]),
  ])
  let hash = 0x811c9dc5
  for (let index = 0; index < canonical.length; index++)
    hash = Math.imul(hash ^ canonical.charCodeAt(index), 0x01000193)
  return (hash >>> 0).toString(36)
}

// Cursors stay short, as a model copies them by hand: where the list resumes, and which request
// it continues, such as 100.k3f9a2.
const readCursor = (token: string | undefined, hash: string) => {
  if (token === undefined || !token.trim()) return 0
  const match = /^(\d+)\.([0-9a-z]+)$/.exec(token.trim())
  if (!match) throw new LocalToolError('Invalid cursor. Restart the call without a cursor.')
  if (match[2] !== hash) throw mismatchedCursor()
  return Number(match[1])
}

// One page of a list: as many entries as fit the result limit from where the cursor left off,
// with the size of the whole list so a count never depends on reading every page.
export const paginate = <T, R extends object>(
  operation: string,
  input: { cursor?: string } & Record<string, unknown>,
  items: readonly T[],
  wrap: (
    entries: T[],
    next: ({ cursor: string } & Record<string, unknown>) | null,
    total: number,
  ) => R,
): R => {
  const { cursor: token, ...request } = input
  const hash = requestHash(operation, request)
  const entries: T[] = []
  for (let index = readCursor(token, hash); index < items.length; index++) {
    const next = { ...request, cursor: `${index}.${hash}` }
    const item = items[index] as T
    if (
      entries.length >= maximumEntries ||
      !fitsResult(wrap([...entries, item], next, items.length))
    ) {
      if (!entries.length) throw new LocalToolError('One entry exceeds the result limit.')
      return wrap(entries, next, items.length)
    }
    entries.push(item)
  }
  return wrap(entries, null, items.length)
}
