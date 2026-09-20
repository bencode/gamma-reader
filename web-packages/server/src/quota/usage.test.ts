import { describe, expect, it } from 'vitest'
import { createUsageSniffer } from './usage.js'

const encoder = new TextEncoder()
const bytesOf = (text: string) => encoder.encode(text)

const pipe = (chunks: Uint8Array[]) => {
  const settled: (number | null)[] = []
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
  return { settled, body: source.pipeThrough(createUsageSniffer(total => settled.push(total))) }
}

const drain = async (chunks: Uint8Array[]) => {
  const { settled, body } = pipe(chunks)
  const text = await new Response(body).text()
  return { settled, text }
}

const event = (total: number) =>
  `data: {"choices":[{"delta":{}}],"usage":{"total_tokens":${total}}}\n\n`

describe('usage sniffer', () => {
  it('forwards bytes untouched and reports the last total across split lines', async () => {
    const transcript = `data: {"choices":[{"delta":{"content":"你好"}}]}\n\n${event(11)}${event(24)}data: [DONE]\n\n`
    const all = bytesOf(transcript)
    // Cut one byte into 你 and again inside the final usage line, so the sniffer
    // has to rejoin both a multi-byte character and a JSON payload.
    const insideCharacter = bytesOf(transcript.slice(0, transcript.indexOf('你'))).length + 1
    const insideUsage = bytesOf(
      transcript.slice(0, transcript.lastIndexOf('"total_tokens"')),
    ).length

    const { settled, text } = await drain([
      all.subarray(0, insideCharacter),
      all.subarray(insideCharacter, insideUsage),
      all.subarray(insideUsage),
    ])

    expect(text).toBe(transcript)
    expect(settled).toEqual([24])
  })

  it('settles without a total when no usage is reported', async () => {
    const transcript = 'data: {"choices":[]}\n\ndata: [DONE]\n\n'
    const { settled, text } = await drain([bytesOf(transcript)])

    expect(text).toBe(transcript)
    expect(settled).toEqual([null])
  })

  it('settles without a total when the reader stops mid-stream', async () => {
    const { settled, body } = pipe([bytesOf(event(9))])
    const reader = body.getReader()
    await reader.read()
    await reader.cancel(new DOMException('Aborted', 'AbortError'))

    expect(settled).toEqual([null])
  })

  it('stops looking once one line outgrows the buffer', async () => {
    const { settled } = await drain([
      bytesOf(`data: {"usage":${'x'.repeat(1024 * 1024 + 1)}`),
      bytesOf(`}\n\n${event(5)}`),
    ])

    expect(settled).toEqual([null])
  })
})
