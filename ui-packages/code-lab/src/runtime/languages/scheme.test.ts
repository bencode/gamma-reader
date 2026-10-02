import { describe, expect, it } from 'vitest'
import { schemeRuntime } from './scheme'

const run = (source: string) => schemeRuntime.run(source, () => undefined)

describe('schemeRuntime', () => {
  it('reports a runtime error with its message', async () => {
    const result = await run('(car 1)')

    expect(result.error).toContain('Attempt to apply car on 1')
    expect(result.outputs).toEqual([])
  })

  it('keeps running cells after an error', async () => {
    await run('(car 1)')

    expect(await run('(+ 1 2)')).toEqual({ outputs: [{ kind: 'text', text: '3' }], error: null })
  })
})
