import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCodeLabSession } from './code-lab-session'
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

  postMessage(request: RuntimeRequest): void {
    this.requests.push(request)
  }

  terminate(): void {
    this.terminated = true
  }

  respond(response: RuntimeResponse): void {
    this.onmessage?.(new MessageEvent('message', { data: response }))
  }

  fail(message: string): void {
    this.onerror?.({ error: new Error(message), message } as ErrorEvent)
  }
}

const cells: readonly CodeLabCell[] = [
  { id: 'scheme-definition', language: 'scheme', source: '(define answer 42)' },
  { id: 'scheme-use', language: 'scheme', source: 'answer' },
  { id: 'python', language: 'python', source: '6 * 7' },
]

beforeEach(() => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker as unknown as typeof Worker)
})

describe('createCodeLabSession', () => {
  it('tracks drafts against the last saved source', () => {
    const session = createCodeLabSession(cells)

    session.updateCell('python', '40 + 2')
    expect(session.getCellSnapshot('python').dirty).toBe(true)
    expect(session.getSessionSnapshot().dirty).toBe(true)

    session.markSaved()
    expect(session.getSessionSnapshot().dirty).toBe(false)

    session.updateCell('python', '41 + 1')
    session.resetCell('python')
    expect(session.getCellSnapshot('python').source).toBe('40 + 2')
    expect(session.getCellSnapshot('python').result).toBeNull()
    expect(session.getSessionSnapshot().dirty).toBe(false)
  })

  it('allows one run per language while other languages remain available', async () => {
    const session = createCodeLabSession(cells)
    const schemeRun = session.runCell('scheme-definition')
    const schemeWorker = FakeWorker.instances[0]
    expect(schemeWorker).toBeDefined()
    expect(session.getCellSnapshot('scheme-use').canRun).toBe(false)
    expect(session.getCellSnapshot('python').canRun).toBe(true)

    const pythonRun = session.runCell('python')
    const pythonWorker = FakeWorker.instances[1]
    expect(pythonWorker).toBeDefined()

    const schemeRequest = schemeWorker?.requests[0]
    const pythonRequest = pythonWorker?.requests[0]
    expect(schemeRequest).toBeDefined()
    expect(pythonRequest).toBeDefined()
    if (!schemeRequest || !pythonRequest || !schemeWorker || !pythonWorker) return

    schemeWorker.respond({
      type: 'progress',
      requestId: schemeRequest.requestId,
      message: 'Running Scheme…',
      phase: 'running',
    })
    expect(session.getCellSnapshot('scheme-definition').phase).toBe('running')

    schemeWorker.respond({
      type: 'result',
      requestId: schemeRequest.requestId,
      result: { outputs: [{ kind: 'text', text: '42' }], error: null },
    })
    pythonWorker.respond({
      type: 'result',
      requestId: pythonRequest.requestId,
      result: { outputs: [{ kind: 'text', text: '42' }], error: null },
    })
    await Promise.all([schemeRun, pythonRun])

    expect(session.getCellSnapshot('scheme-definition').phase).toBe('succeeded')
    expect(session.getCellSnapshot('scheme-use').canRun).toBe(true)
    expect(session.getCellSnapshot('python').phase).toBe('succeeded')
  })

  it('terminates a stopped language and ignores late worker responses', async () => {
    const session = createCodeLabSession(cells)
    const firstRun = session.runCell('scheme-definition')
    const firstWorker = FakeWorker.instances[0]
    const firstRequest = firstWorker?.requests[0]
    expect(firstWorker).toBeDefined()
    expect(firstRequest).toBeDefined()
    if (!firstWorker || !firstRequest) return

    session.stopCell('scheme-definition')
    await firstRun
    expect(firstWorker.terminated).toBe(true)
    expect(session.getCellSnapshot('scheme-definition').phase).toBe('stopped')

    const secondRun = session.runCell('scheme-use')
    const secondWorker = FakeWorker.instances[1]
    const secondRequest = secondWorker?.requests[0]
    expect(secondWorker).toBeDefined()
    expect(secondRequest).toBeDefined()
    if (!secondWorker || !secondRequest) return

    firstWorker.respond({
      type: 'result',
      requestId: firstRequest.requestId,
      result: { outputs: [{ kind: 'text', text: 'stale' }], error: null },
    })
    firstWorker.fail('stale worker failure')
    expect(secondWorker.terminated).toBe(false)
    expect(session.getCellSnapshot('scheme-use').phase).toBe('loading')

    secondWorker.respond({
      type: 'result',
      requestId: secondRequest.requestId,
      result: { outputs: [{ kind: 'text', text: '42' }], error: null },
    })
    await secondRun
    expect(session.getCellSnapshot('scheme-use').result?.outputs).toEqual([
      { kind: 'text', text: '42' },
    ])
  })

  it('releases active workers on dispose and can be used after a Strict Mode cleanup', async () => {
    const session = createCodeLabSession(cells)
    const firstRun = session.runCell('python')
    const firstWorker = FakeWorker.instances[0]
    expect(firstWorker).toBeDefined()
    if (!firstWorker) return

    session.dispose()
    await firstRun
    expect(firstWorker.terminated).toBe(true)
    expect(session.getCellSnapshot('python').phase).toBe('stopped')

    const secondRun = session.runCell('python')
    const secondWorker = FakeWorker.instances[1]
    const secondRequest = secondWorker?.requests[0]
    expect(secondWorker).toBeDefined()
    expect(secondRequest).toBeDefined()
    if (!secondWorker || !secondRequest) return

    secondWorker.respond({
      type: 'result',
      requestId: secondRequest.requestId,
      result: { outputs: [{ kind: 'text', text: '42' }], error: null },
    })
    await secondRun
    expect(session.getCellSnapshot('python').phase).toBe('succeeded')
  })

  it('rejects duplicate cell identifiers', () => {
    expect(() => createCodeLabSession([...cells, cells[0] as CodeLabCell])).toThrow(
      'Duplicate Code Lab cell id',
    )
  })
})
