import type {
  CellExecution,
  CodeLabCell,
  CodeLabLanguage,
  CodeLabOutput,
  CodeLabRuntime,
} from '@gamma-reader/code-lab'
import { fitsResult, maximumResultBytes } from './pagination'
import { LocalToolError } from './tool-types'

// A lab open in a tab: its draft as it is now and the runtime its cells run in.
export type LabRunner = {
  fileId: string
  document: () => { version: string; cells: readonly CodeLabCell[] } | null
  // The id of the cell the reader is in, if any.
  current: () => string | null
  runtime: Pick<CodeLabRuntime, 'runCell' | 'stopCell' | 'getSnapshot'>
}

export type LabAccess = {
  // The lab in the active tab, or null when the active tab is not a lab.
  active: () => { path: string; runner: LabRunner } | null
  runner: (fileId: string) => LabRunner | undefined
}

// Cells as the reader names them: a number (1 is the first cell), an id, or "current".
export type LabCellsInput = { cells?: (number | string)[] }

type LabOutput = { kind: CodeLabOutput['kind']; text: string }
type LabCellReport = {
  number: number
  id: string
  language: CodeLabLanguage
  status: 'idle' | 'running' | 'succeeded' | 'failed' | 'stopped' | 'skipped'
  progress?: string
  stale?: boolean
  outputs?: LabOutput[]
  error?: string
}
export type LabCellsResult = {
  fileId: string
  path: string
  version: string
  // The number of the cell the reader is in, if any.
  current: number | null
  cells: LabCellReport[]
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

// Keeps the start and the end, where a traceback names the error, and says how much was left out.
const clipped = (text: string, maximumBytes: number) => {
  const bytes = encoder.encode(text)
  if (bytes.length <= maximumBytes) return text
  const half = Math.max(0, Math.floor(maximumBytes / 2) - 32)
  let head = half
  while (head > 0 && ((bytes[head] ?? 0) & 0xc0) === 0x80) head--
  let tail = bytes.length - half
  while (tail < bytes.length && ((bytes[tail] ?? 0) & 0xc0) === 0x80) tail++
  return `${decoder.decode(bytes.subarray(0, head))}\n… ${tail - head} bytes omitted …\n${decoder.decode(bytes.subarray(tail))}`
}

const outputText = (output: CodeLabOutput): LabOutput => {
  if (output.kind === 'html') return { kind: 'html', text: output.html }
  if (output.kind === 'latex') return { kind: 'latex', text: output.latex }
  if (output.kind === 'image')
    return { kind: 'image', text: 'PNG image shown in the lab; you cannot see it.' }
  return { kind: output.kind, text: output.text }
}

type NumberedCell = CodeLabCell & { number: number }

const cellReport = (cell: NumberedCell, execution: CellExecution | undefined): LabCellReport => {
  const base = { number: cell.number, id: cell.id, language: cell.language }
  if (!execution) return { ...base, status: 'idle' }
  if (execution.phase === 'loading' || execution.phase === 'running')
    return {
      ...base,
      status: 'running',
      ...(execution.progress && { progress: execution.progress }),
    }
  const outputs = execution.result?.outputs.map(outputText) ?? []
  const error = execution.result?.error
  return {
    ...base,
    status: execution.phase,
    ...(outputs.length && { outputs }),
    ...(error && { error }),
  }
}

// Shares the result limit evenly among the texts, halving each share until the result fits.
const fitted = (result: LabCellsResult): LabCellsResult => {
  if (fitsResult(result)) return result
  const texts = result.cells.reduce(
    (count, cell) => count + (cell.outputs?.length ?? 0) + (cell.error ? 1 : 0),
    0,
  )
  for (let share = Math.floor(maximumResultBytes / Math.max(texts, 1)); share >= 64; share /= 2) {
    const limit = Math.floor(share)
    const candidate = {
      ...result,
      cells: result.cells.map(cell => ({
        ...cell,
        ...(cell.outputs && {
          outputs: cell.outputs.map(output => ({ ...output, text: clipped(output.text, limit) })),
        }),
        ...(cell.error && { error: clipped(cell.error, limit) }),
      })),
    }
    if (fitsResult(candidate)) return candidate
  }
  throw new LocalToolError('These cells produce too much to report. Pass fewer cells.')
}

const openLab = (access: LabAccess, input: LabCellsInput) => {
  const lab = access.active()
  if (!lab)
    throw new LocalToolError('The active tab is not a lab (.lab.md). Ask the reader to open it.')
  const { path, runner } = lab
  const document = runner.document()
  if (!document) throw new LocalToolError('The lab is still loading. Call again shortly.')
  const cells = document.cells.map((cell, index) => ({ ...cell, number: index + 1 }))
  const current = cells.find(cell => cell.id === runner.current()) ?? null
  const header = {
    fileId: runner.fileId,
    path,
    version: document.version,
    current: current?.number ?? null,
  }
  if (!input.cells?.length) return { runner, header, cells }
  const listing = cells.map(cell => `#${cell.number} ${cell.id}`).join(', ') || 'none'
  const chosen = input.cells.map(name => {
    if (typeof name === 'number') {
      const cell = cells[name - 1]
      if (!cell)
        throw new LocalToolError(
          cells.length
            ? `No cell ${name}: this lab has cells 1–${cells.length}.`
            : 'This lab has no cells.',
        )
      return cell
    }
    if (name === 'current') {
      if (!current)
        throw new LocalToolError(
          'There is no current cell: the reader has not been in one yet. Ask which cell they mean.',
        )
      return current
    }
    const cell = cells.find(candidate => candidate.id === name)
    if (!cell) throw new LocalToolError(`Unknown cell ${name}. Cells in this lab: ${listing}.`)
    return cell
  })
  return { runner, header, cells: chosen }
}

export const readLabCells = (access: LabAccess, input: LabCellsInput): LabCellsResult => {
  const { runner, header, cells } = openLab(access, input)
  const snapshot = runner.runtime.getSnapshot()
  return fitted({
    ...header,
    cells: cells.map(cell => {
      const execution = snapshot.get(cell.id)
      const report = cellReport(cell, execution)
      return execution ? { ...report, stale: execution.source !== cell.source } : report
    }),
  })
}

const stopped = (cell: NumberedCell, error: string): LabCellReport => ({
  number: cell.number,
  id: cell.id,
  language: cell.language,
  status: 'stopped',
  error,
})

// Runs in order and stops at the first cell that does not succeed; later cells are skipped.
export const runLabCells = async (
  access: LabAccess,
  input: LabCellsInput,
  signal?: AbortSignal,
): Promise<LabCellsResult> => {
  const { runner, header, cells } = openLab(access, input)
  const reports: LabCellReport[] = []
  for (const cell of cells) {
    signal?.throwIfAborted()
    if (reports.some(report => report.status !== 'succeeded')) {
      reports.push({ number: cell.number, id: cell.id, language: cell.language, status: 'skipped' })
      continue
    }
    // A closed lab's runtime is released; running in it would start a worker nothing stops.
    if (access.runner(runner.fileId) !== runner) {
      reports.push(stopped(cell, 'The lab was closed.'))
      continue
    }
    const stop = () => runner.runtime.stopCell(cell.id)
    signal?.addEventListener('abort', stop, { once: true })
    const started = await runner.runtime.runCell(cell).finally(() => {
      signal?.removeEventListener('abort', stop)
    })
    signal?.throwIfAborted()
    const execution = runner.runtime.getSnapshot().get(cell.id)
    reports.push(
      !started
        ? stopped(cell, `Another ${cell.language} cell is running in the lab. Run again later.`)
        : execution
          ? cellReport(cell, execution)
          : stopped(cell, 'The cell was removed while running.'),
    )
  }
  return fitted({ ...header, cells: reports })
}
