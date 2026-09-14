export const p5FrameChannel = 'gamma-reader:p5'

export type P5FrameCommand = {
  channel: typeof p5FrameChannel
  runId: string
  type: 'pause' | 'resume' | 'suspend' | 'restore' | 'status'
}

export type P5FrameEvent =
  | { channel: typeof p5FrameChannel; runId: string; type: 'ready' }
  | {
      channel: typeof p5FrameChannel
      runId: string
      type: 'error'
      message: string
      stack?: string
    }

const scriptValue = (value: string) =>
  JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')

const attributeValue = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')

export const createP5FrameDocument = ({
  runtimeUrl,
  runId,
  source,
}: {
  runtimeUrl: string
  runId: string
  source: string
}) => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body { min-height: 100%; margin: 0; }
      body { display: grid; place-items: center; overflow: auto; background: #fff; }
      canvas { display: block; }
    </style>
  </head>
  <body>
    <script src="${attributeValue(runtimeUrl)}"></script>
    <script>
      (() => {
        const channel = ${scriptValue(p5FrameChannel)}
        const runId = ${scriptValue(runId)}
        let frameState = { type: 'loading' }
        let explicitlyPaused = false
        let suspended = false
        let resumeAfterSuspend = false
        const send = message => parent.postMessage({ channel, runId, ...message }, '*')
        const fail = (message, stack) => {
          frameState = { type: 'error', message: String(message || 'The sketch failed.'), ...(stack ? { stack: String(stack) } : {}) }
          send(frameState)
        }
        addEventListener('error', event => fail(event.message, event.error?.stack))
        addEventListener('unhandledrejection', event => fail(event.reason?.message || event.reason, event.reason?.stack))
        addEventListener('message', event => {
          const message = event.data
          if (event.source !== parent || message?.channel !== channel || message?.runId !== runId) return
          if (message.type === 'status' && frameState.type !== 'loading') send(frameState)
          if (message.type === 'pause') {
            explicitlyPaused = true
            if (typeof noLoop === 'function') noLoop()
          }
          if (message.type === 'resume') {
            explicitlyPaused = false
            if (!suspended && typeof loop === 'function') loop()
          }
          if (message.type === 'suspend' && !suspended) {
            resumeAfterSuspend = !explicitlyPaused && (typeof isLooping !== 'function' || isLooping())
            suspended = true
            if (typeof noLoop === 'function') noLoop()
          }
          if (message.type === 'restore' && suspended) {
            suspended = false
            if (resumeAfterSuspend && !explicitlyPaused && typeof loop === 'function') loop()
          }
        })
        if (typeof p5 !== 'function') {
          fail('The p5 runtime could not be loaded.')
        } else {
          try {
            ;(0, eval)(${scriptValue(source)})
          } catch (error) {
            fail(error?.message || error, error?.stack)
          }
        }
        addEventListener('load', () => {
          if (frameState.type !== 'error') {
            frameState = { type: 'ready' }
            send(frameState)
          }
        })
      })()
    </script>
  </body>
</html>`

export const isP5FrameEvent = (value: unknown): value is P5FrameEvent => {
  if (!value || typeof value !== 'object') return false
  const message = value as Record<string, unknown>
  return (
    message.channel === p5FrameChannel &&
    typeof message.runId === 'string' &&
    (message.type === 'ready' || (message.type === 'error' && typeof message.message === 'string'))
  )
}
