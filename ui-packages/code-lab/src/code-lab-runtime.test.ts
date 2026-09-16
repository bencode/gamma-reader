import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCodeLabRuntime } from './code-lab-runtime'
import type { RuntimeRequest, RuntimeResponse } from './runtime/protocol'
import type { CodeLabCell } from './types'

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((event: MessageEvent<RuntimeResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly requests: RuntimeRequest[] = []
  terminated = false

  constructor() {
    FakeWorker.instances.push(this)
  }
  postMessage(request: RuntimeRequest) {
    this.requests.push(request)
  }
  terminate() {
    this.terminated = true
  }
  complete(text: string) {
    const request = this.requests.at(-1)
    if (!request) throw new Error('The worker has no pending request.')
    this.onmessage?.(
      new MessageEvent('message', {
        data: {
          type: 'result',
          requestId: request.requestId,
          result: { outputs: [{ kind: 'text', text }], error: null },
        },
      }),
    )
  }
}

const python: CodeLabCell = { id: 'python', language: 'python', source: '21 * 2' }
const scheme: CodeLabCell = { id: 'scheme', language: 'scheme', source: '(+ 40 2)' }
const workerAt = (index: number) => {
  const worker = FakeWorker.instances[index]
  if (!worker) throw new Error(`Worker ${index} was not created.`)
  return worker
}

beforeEach(() => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
})
afterEach(() => vi.unstubAllGlobals())

describe('Code Lab execution', () => {
  it('starts workers only on demand, shares a language, and keeps the executed source', async () => {
    const runtime = createCodeLabRuntime()
    runtime.synchronizeMembership([python, scheme])
    expect(FakeWorker.instances).toHaveLength(0)
    const run = runtime.runCell(python)
    await runtime.runCell({ ...python, id: 'another' })
    expect(workerAt(0).requests).toHaveLength(1)
    const parallel = runtime.runCell(scheme)
    expect(FakeWorker.instances).toHaveLength(2)
    runtime.synchronizeMembership([{ ...python, source: '100' }, scheme])
    expect(runtime.getSnapshot().get(python.id)?.source).toBe(python.source)
    workerAt(0).complete('42')
    workerAt(1).complete('42')
    await Promise.all([run, parallel])
    const stable = runtime.getSnapshot()
    runtime.synchronizeMembership([{ ...python }, { ...scheme }])
    expect(runtime.getSnapshot()).toBe(stable)
    const next = runtime.runCell({ ...python, id: 'another', source: '43' })
    expect(FakeWorker.instances).toHaveLength(2)
    expect(workerAt(0).requests).toHaveLength(2)
    workerAt(0).complete('43')
    await next
    runtime.dispose()
  })

  it('does not let a stopped run clear an immediate replacement run of the same cell', async () => {
    const runtime = createCodeLabRuntime()
    const first = runtime.runCell(python)
    runtime.stopCell(python.id)
    const replacement = runtime.runCell({ ...python, source: '99' })
    await first
    expect(workerAt(0).terminated).toBe(true)
    workerAt(0).complete('stale')
    expect(runtime.getSnapshot().get(python.id)?.phase).toBe('loading')
    workerAt(1).complete('99')
    await replacement
    expect(runtime.getSnapshot().get(python.id)?.result?.outputs).toEqual([
      { kind: 'text', text: '99' },
    ])
    expect(runtime.getSnapshot().get(python.id)?.source).toBe('99')
    runtime.dispose()
  })

  it('cleans removed or retyped cells without terminating unrelated work', async () => {
    const runtime = createCodeLabRuntime()
    const first = runtime.runCell(python)
    const parallel = runtime.runCell(scheme)
    runtime.synchronizeMembership([scheme])
    await first
    expect(runtime.getSnapshot().has(python.id)).toBe(false)
    expect(workerAt(0).terminated).toBe(true)
    expect(workerAt(1).terminated).toBe(false)
    workerAt(0).complete('stale')
    expect(runtime.getSnapshot().has(python.id)).toBe(false)
    runtime.synchronizeMembership([{ ...scheme, language: 'typescript' }])
    await parallel
    expect(workerAt(1).terminated).toBe(true)
    expect(runtime.getSnapshot().size).toBe(0)
    const added = runtime.runCell(python)
    workerAt(2).complete('42')
    await added
    expect(runtime.getSnapshot().get(python.id)?.phase).toBe('succeeded')
    runtime.dispose()
  })

  it('isolates runtimes and releases workers while remaining usable after effect reconnection', async () => {
    const first = createCodeLabRuntime()
    const second = createCodeLabRuntime()
    const firstRun = first.runCell(python)
    const secondRun = second.runCell(python)
    first.dispose()
    await firstRun
    expect(workerAt(0).terminated).toBe(true)
    expect(workerAt(1).terminated).toBe(false)
    workerAt(1).complete('42')
    await secondRun
    const reconnected = first.runCell(python)
    workerAt(2).complete('43')
    await reconnected
    expect(first.getSnapshot().get(python.id)?.result).not.toEqual(
      second.getSnapshot().get(python.id)?.result,
    )
    first.dispose()
    second.dispose()
  })
})
