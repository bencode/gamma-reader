// WebKit ships ReadableStream async iteration only in Safari 27, so on iOS 26 and earlier
// `for await (… of stream)` throws. pdf.js reads a page's text layer that way, which is what
// makes every page render fail there. Remove this once Safari 27 is the supported floor.
export const streamValues = <R>(
  stream: ReadableStream<R>,
  { preventCancel = false }: { preventCancel?: boolean } = {},
): AsyncIterableIterator<R> => {
  const reader = stream.getReader()
  return {
    async next() {
      try {
        const result = await reader.read()
        if (result.done) reader.releaseLock()
        return result
      } catch (error) {
        reader.releaseLock()
        throw error
      }
    },
    async return(value?: R) {
      if (!preventCancel) await reader.cancel(value)
      reader.releaseLock()
      return { value, done: true }
    },
    [Symbol.asyncIterator]() {
      return this
    },
  }
}

function values<R>(this: ReadableStream<R>, options?: { preventCancel?: boolean }) {
  return streamValues(this, options)
}

// Those browsers have no Symbol.asyncDispose either, so the iterator cannot satisfy the full
// ReadableStreamAsyncIterator type; `for await` only ever calls next and return.
type StreamIteration = { values: typeof values; [Symbol.asyncIterator]: typeof values }

export const installReadableStreamAsyncIteration = () => {
  if (typeof ReadableStream === 'undefined' || ReadableStream.prototype[Symbol.asyncIterator])
    return
  const prototype = ReadableStream.prototype as unknown as StreamIteration
  prototype.values = values
  prototype[Symbol.asyncIterator] = values
}
