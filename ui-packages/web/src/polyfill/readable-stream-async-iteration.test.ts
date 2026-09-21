import { describe, expect, it, vi } from 'vitest'
import { streamValues } from './readable-stream-async-iteration'

const chunkStream = (chunks: readonly string[], cancel = vi.fn()) =>
  new ReadableStream<string>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
    cancel,
  })

describe('ReadableStream async iteration for engines without it', () => {
  it('yields every chunk in order', async () => {
    const read: string[] = []
    for await (const chunk of streamValues(chunkStream(['a', 'b', 'c']))) read.push(chunk)
    expect(read).toEqual(['a', 'b', 'c'])
  })

  it('cancels the stream when the loop exits early', async () => {
    const cancel = vi.fn()
    const stream = chunkStream(['a', 'b', 'c'], cancel)
    for await (const chunk of streamValues(stream)) {
      if (chunk === 'b') break
    }
    expect(cancel).toHaveBeenCalledOnce()
    expect(stream.locked).toBe(false)
  })
})
