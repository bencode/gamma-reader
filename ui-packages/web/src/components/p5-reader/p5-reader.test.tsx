import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { prepareP5SourceFile } from '../../features/reader/p5-file'
import { createP5FrameDocument, p5FrameChannel } from './frame-document'
import { P5Reader } from './index'

describe('p5 reader', () => {
  it('prepares p5 sources as text without changing their contents', async () => {
    const source = 'function setup() { createCanvas(200, 200) }'
    const input = new File([source], 'Scene.P5.JS', { type: 'application/javascript' })
    const prepared = prepareP5SourceFile(input)

    expect(prepared.name).toBe(input.name)
    expect(prepared.type).toBe('text/javascript')
    expect(await prepared.text()).toBe(source)
    expect(prepareP5SourceFile(new File([''], 'plain.js'))).toHaveProperty('name', 'plain.js')
  })

  it('serializes source without allowing it to close the frame script', () => {
    const document = createP5FrameDocument({
      runtimeUrl: '/assets/p5.js?x=<unsafe>',
      runId: 'run-1',
      source: '</script><script>parent.postMessage("escaped", "*")</script>',
    })

    expect(document).toContain('src="/assets/p5.js?x=&lt;unsafe&gt;"')
    expect(document).not.toContain('</script><script>parent.postMessage("escaped"')
    expect(document).toContain('\\u003c/script>')
  })

  it('runs in a sandbox and reports frame errors', async () => {
    const user = userEvent.setup({ delay: null })
    render(<P5Reader name="scene.p5.js" source="function setup() {}" active />)

    const frame = screen.getByTitle('scene.p5.js p5 preview')
    expect(frame).toHaveAttribute('sandbox', 'allow-scripts')
    expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer')

    const srcDoc = frame.getAttribute('srcdoc') ?? ''
    const runId = srcDoc.match(/const runId = "([^"]+)"/)?.[1]
    expect(runId).toBeTruthy()
    fireEvent(
      window,
      new MessageEvent('message', {
        source: (frame as HTMLIFrameElement).contentWindow,
        data: { channel: p5FrameChannel, runId, type: 'error', message: 'broken sketch' },
      }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('broken sketch')

    await user.click(screen.getByRole('button', { name: 'Restart sketch' }))
    expect(screen.getByTitle('scene.p5.js p5 preview')).not.toHaveAttribute('srcdoc', srcDoc)
  })

  it('runs edited source only on explicit request', async () => {
    const user = userEvent.setup({ delay: null })
    const view = render(<P5Reader name="scene.p5.js" source="function setup() {}" active />)
    const original = screen.getByTitle('scene.p5.js p5 preview').getAttribute('srcdoc')
    view.rerender(
      <P5Reader name="scene.p5.js" source="function setup() { background(0) }" active />,
    )
    expect(screen.getByTitle('scene.p5.js p5 preview')).toHaveAttribute('srcdoc', original)
    await user.click(screen.getByRole('button', { name: 'Run changes' }))
    expect(screen.getByTitle('scene.p5.js p5 preview')).not.toHaveAttribute('srcdoc', original)
  })

  it('recovers frame state and separates lifecycle suspension from user controls', async () => {
    const user = userEvent.setup({ delay: null })
    const view = render(<P5Reader name="scene.p5.js" source="function draw() {}" active />)
    const frame = screen.getByTitle<HTMLIFrameElement>('scene.p5.js p5 preview')
    const postMessage = vi.spyOn(frame.contentWindow as Window, 'postMessage')
    const runId = (frame.getAttribute('srcdoc') ?? '').match(/const runId = "([^"]+)"/)?.[1]

    fireEvent.load(frame)
    expect(postMessage).toHaveBeenCalledWith(
      { channel: p5FrameChannel, runId, type: 'status' },
      '*',
    )
    fireEvent(
      window,
      new MessageEvent('message', {
        source: frame.contentWindow,
        data: { channel: p5FrameChannel, runId, type: 'ready' },
      }),
    )

    await user.click(await screen.findByRole('button', { name: 'Pause sketch' }))
    expect(postMessage).toHaveBeenCalledWith({ channel: p5FrameChannel, runId, type: 'pause' }, '*')

    view.rerender(<P5Reader name="scene.p5.js" source="function draw() {}" active={false} />)
    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        { channel: p5FrameChannel, runId, type: 'suspend' },
        '*',
      ),
    )
    view.rerender(<P5Reader name="scene.p5.js" source="function draw() {}" active />)
    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        { channel: p5FrameChannel, runId, type: 'restore' },
        '*',
      ),
    )

    await user.click(screen.getByRole('button', { name: 'Resume sketch' }))
    expect(postMessage).toHaveBeenCalledWith(
      { channel: p5FrameChannel, runId, type: 'resume' },
      '*',
    )
  })
})
