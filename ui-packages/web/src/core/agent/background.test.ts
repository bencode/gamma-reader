import { Type } from '@earendil-works/pi-ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { modelConfig } from '../../test/model-config'
import { type BackgroundAgent, runBackgroundAgent } from './background'
import { bind } from './tool'

const project = 'gamma-reader-files'

const event = (delta: unknown, finish: string | null = null) =>
  `data: ${JSON.stringify({ id: 'reply', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`
const stream = (body: string) =>
  new Response(`${body}data: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
const call = () =>
  stream(
    event(
      {
        tool_calls: [
          {
            index: 0,
            id: 'call',
            type: 'function',
            function: { name: 'look', arguments: '{}' },
          },
        ],
      },
      'tool_calls',
    ),
  )
const reply = () => stream(event({ content: 'done' }) + event({}, 'stop'))

const worker = (overrides: Partial<BackgroundAgent>): BackgroundAgent => ({
  name: 'worker',
  instructions: 'Work.',
  task: 'Work.',
  maxTurns: 3,
  enabled: () => true,
  tools: () => [bind('look', 'Look.', Type.Object({}), () => ({}))],
  skills: [],
  pending: async () => 0,
  ...overrides,
})

describe('background agents', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: (_name: string, _options: unknown, run: (lock: object) => unknown) => run({}),
      },
    })
  })

  it('stops an agent at its turn limit', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input =>
      String(input) === '/api/agent/config' ? Response.json(modelConfig) : call(),
    )
    expect(await runBackgroundAgent(worker({ name: 'endless' }), project)).toMatchObject({
      turns: 3,
      stoppedBy: 'limit',
    })
    // Cut short, it has not finished: the next run starts from the same changes.
    expect(localStorage.getItem(`gamma-reader.agent-run:endless:${project}`)).toBeNull()
  })

  it('notes when a run finished, but not a run that failed', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input =>
      String(input) === '/api/agent/config' ? Response.json(modelConfig) : reply(),
    )
    const before = Date.now()
    await runBackgroundAgent(worker({ name: 'noted' }), project)
    expect(
      Number(localStorage.getItem(`gamma-reader.agent-run:noted:${project}`)),
    ).toBeGreaterThanOrEqual(before)

    vi.spyOn(globalThis, 'fetch').mockImplementation(async input =>
      String(input) === '/api/agent/config'
        ? Response.json(modelConfig)
        : new Response('down', { status: 500 }),
    )
    await runBackgroundAgent(worker({ name: 'failing' }), project)
    expect(localStorage.getItem(`gamma-reader.agent-run:failing:${project}`)).toBeNull()
  })

  it('runs until no work is left, and stops when a run makes no headway', async () => {
    const runs: number[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      if (String(input) === '/api/agent/config') return Response.json(modelConfig)
      runs.push(runs.length)
      return reply()
    })
    const backlog = [3, 2, 0]
    const drained = await runBackgroundAgent(
      worker({ name: 'draining', pending: async () => backlog.shift() ?? 0 }),
      project,
      { untilDone: true },
    )
    expect(runs).toHaveLength(2)
    expect(drained).toMatchObject({ turns: 2 })

    runs.length = 0
    await runBackgroundAgent(worker({ name: 'stuck', pending: async () => 2 }), project, {
      untilDone: true,
    })
    expect(runs).toHaveLength(1)
  })
})
