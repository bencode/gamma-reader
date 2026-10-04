import type { CellExecution, CodeLabCell, CodeLabExecutionResult } from '@gamma-reader/code-lab'
import { describe, expect, it, vi } from 'vitest'
import { type LabAccess, type LabRunner, readLabCells, runLabCells } from './lab-tools'
import { resultBytes } from './pagination'

const cell = (id: string, source = `(display "${id}")`): CodeLabCell => ({
  id,
  language: 'scheme',
  source,
})

// Each cell finishes with its planned result; 'busy' means its language was already running.
const lab = (
  cells: CodeLabCell[],
  plan: Record<string, CodeLabExecutionResult | 'busy' | 'hang'> = {},
  previous: Record<string, CellExecution> = {},
) => {
  let snapshot: ReadonlyMap<string, CellExecution> = new Map(Object.entries(previous))
  const settle = (id: string, execution: CellExecution) => {
    snapshot = new Map(snapshot).set(id, execution)
  }
  const stopping = new Map<string, () => void>()
  const runtime: LabRunner['runtime'] = {
    getSnapshot: () => snapshot,
    stopCell: vi.fn((id: string) => stopping.get(id)?.()),
    runCell: async ({ id, language, source }) => {
      const planned = plan[id]
      if (planned === 'busy') return false
      if (planned === 'hang')
        return new Promise<boolean>(resolve => {
          stopping.set(id, () => {
            settle(id, { language, source, phase: 'stopped', progress: null, result: null })
            resolve(true)
          })
        })
      const result = planned ?? { outputs: [], error: null }
      settle(id, {
        language,
        source,
        phase: result.error ? 'failed' : 'succeeded',
        progress: null,
        result,
      })
      return true
    },
  }
  const runner: LabRunner = {
    fileId: 'lab',
    document: () => ({ version: 'v1', cells }),
    runtime,
  }
  const access: LabAccess = {
    active: () => ({ path: 'test.lab.md', runner }),
    runner: fileId => (fileId === 'lab' ? runner : undefined),
  }
  return { access, runtime }
}

describe('run_lab_cells', () => {
  it('runs every cell in order and skips the rest after the first failure', async () => {
    // [] means every cell, as omitting cellIds does.
    const { access } = lab([cell('a'), cell('b'), cell('c')], {
      a: {
        outputs: [
          { kind: 'stdout', text: 'a\n' },
          { kind: 'image', mediaType: 'image/png', base64: 'AA==' },
        ],
        error: null,
      },
      b: { outputs: [{ kind: 'stdout', text: 'before' }], error: 'Error: car of 1' },
    })
    expect(await runLabCells(access, { cellIds: [] })).toEqual({
      fileId: 'lab',
      path: 'test.lab.md',
      version: 'v1',
      cells: [
        {
          id: 'a',
          language: 'scheme',
          status: 'succeeded',
          outputs: [
            { kind: 'stdout', text: 'a\n' },
            { kind: 'image', text: 'PNG image shown in the lab; you cannot see it.' },
          ],
        },
        {
          id: 'b',
          language: 'scheme',
          status: 'failed',
          outputs: [{ kind: 'stdout', text: 'before' }],
          error: 'Error: car of 1',
        },
        { id: 'c', language: 'scheme', status: 'skipped' },
      ],
    })
  })

  it('reports a cell that could not start instead of its earlier result', async () => {
    const { access } = lab(
      [cell('a')],
      { a: 'busy' },
      {
        a: {
          language: 'scheme',
          source: 'old',
          phase: 'succeeded',
          progress: null,
          result: { outputs: [{ kind: 'text', text: 'old' }], error: null },
        },
      },
    )
    const result = await runLabCells(access, {})
    expect(result.cells).toEqual([
      {
        id: 'a',
        language: 'scheme',
        status: 'stopped',
        error: 'Another scheme cell is running in the lab. Run again later.',
      },
    ])
  })

  it('rejects unknown cells and an active tab that is not a lab', async () => {
    const { access } = lab([cell('a')])
    await expect(runLabCells(access, { cellIds: ['a', 'x'] })).rejects.toThrow(
      'Unknown cell ids: x. Cells in this lab: a.',
    )
    await expect(runLabCells({ ...access, active: () => null }, {})).rejects.toThrow(
      'The active tab is not a lab',
    )
  })

  it('stops the running cell when the conversation is stopped', async () => {
    const { access, runtime } = lab([cell('a'), cell('b')], { a: 'hang' })
    const controller = new AbortController()
    const run = runLabCells(access, {}, controller.signal)
    controller.abort()
    await expect(run).rejects.toThrow()
    expect(runtime.stopCell).toHaveBeenCalledWith('a')
  })

  it('keeps the end of a long error within the result limit', async () => {
    const traceback = `${'  File "<cell>", line 1\n'.repeat(4000)}ZeroDivisionError: division by zero`
    const { access } = lab([cell('a')], { a: { outputs: [], error: traceback } })
    const result = await runLabCells(access, {})
    expect(resultBytes(result)).toBeLessThanOrEqual(16 * 1024)
    expect(result.cells[0]?.error).toMatch(
      /bytes omitted[\s\S]*ZeroDivisionError: division by zero$/,
    )
  })
})

describe('read_lab_cells', () => {
  it('reads results the reader got without running, marking cells whose code changed', () => {
    const { access, runtime } = lab(
      [cell('a'), cell('b', '(+ 1 2)'), cell('c')],
      {},
      {
        a: {
          language: 'scheme',
          source: '(display "a")',
          phase: 'failed',
          progress: null,
          result: { outputs: [], error: 'Error: unbound variable x' },
        },
        b: {
          language: 'scheme',
          source: '(+ 1 1)',
          phase: 'succeeded',
          progress: null,
          result: { outputs: [{ kind: 'text', text: '2' }], error: null },
        },
      },
    )
    runtime.runCell = vi.fn()
    expect(readLabCells(access, {}).cells).toEqual([
      {
        id: 'a',
        language: 'scheme',
        status: 'failed',
        error: 'Error: unbound variable x',
        stale: false,
      },
      {
        id: 'b',
        language: 'scheme',
        status: 'succeeded',
        outputs: [{ kind: 'text', text: '2' }],
        stale: true,
      },
      { id: 'c', language: 'scheme', status: 'idle' },
    ])
    expect(runtime.runCell).not.toHaveBeenCalled()
  })
})
