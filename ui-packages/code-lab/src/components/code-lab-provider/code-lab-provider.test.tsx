// @vitest-environment jsdom
import { EditorView } from '@codemirror/view'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Activity, StrictMode, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CodeCell, type CodeLabCell, CodeLabProvider } from '../../index'
import type { RuntimeRequest, RuntimeResponse } from '../../runtime/protocol'

vi.mock('../code-cell/language-extension', () => ({ loadLanguageExtension: async () => [] }))

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((event: MessageEvent<RuntimeResponse>) => void) | null = null
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
  complete() {
    const request = this.requests.at(-1)
    if (!request) throw new Error('No request was sent.')
    this.onmessage?.(
      new MessageEvent('message', {
        data: {
          type: 'result',
          requestId: request.requestId,
          result: { outputs: [{ kind: 'text', text: '42' }], error: null },
        },
      }),
    )
  }
}

const cell: CodeLabCell = { id: 'example', language: 'typescript', source: '21 * 2' }
const workerAt = (index: number) => {
  const worker = FakeWorker.instances[index]
  if (!worker) throw new Error(`Worker ${index} was not created.`)
  return worker
}

beforeEach(() => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('controlled Code Lab', () => {
  it('reflects external source without an edit callback and runs the current source', async () => {
    const changed = vi.fn()
    const tree = (source: string) => (
      <CodeLabProvider cells={[{ ...cell, source }]} onCellChange={changed}>
        <CodeCell cellId={cell.id} />
      </CodeLabProvider>
    )
    const view = render(tree(cell.source))
    view.rerender(tree('40 + 2'))
    await waitFor(() =>
      expect(view.container.querySelector('.cm-content')?.textContent).toBe('40 + 2'),
    )
    expect(changed).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(workerAt(0).requests[0]?.source).toBe('40 + 2')
    view.rerender(tree('100'))
    await act(async () => workerAt(0).complete())
    expect(screen.getByText('Code changed · Run again')).toBeDefined()
    view.rerender(tree('40 + 2'))
    expect(screen.queryByText('Code changed · Run again')).toBeNull()
  })

  it('reports a user edit once and accepts the controlled value', async () => {
    const changed = vi.fn()
    const Example = () => {
      const [source, setSource] = useState(cell.source)
      return (
        <CodeLabProvider
          cells={[{ ...cell, source }]}
          onCellChange={(id, next) => {
            changed(id, next)
            setSource(next)
          }}
        >
          <CodeCell cellId={cell.id} />
        </CodeLabProvider>
      )
    }
    const { container } = render(<Example />)
    const editor = container.querySelector<HTMLElement>('.cm-content')
    if (!editor) throw new Error('The editor did not mount.')
    const view = EditorView.findFromDOM(editor)
    if (!view) throw new Error('The editor view did not mount.')
    act(() => {
      view.dispatch({ changes: { from: 0, to: cell.source.length, insert: '40 + 2' } })
    })
    await waitFor(() => expect(changed).toHaveBeenCalledExactlyOnceWith(cell.id, '40 + 2'))
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(workerAt(0).requests[0]?.source).toBe('40 + 2')
  })

  it('is read-only without a change handler and isolates providers with identical cell ids', () => {
    const { container } = render(
      <>
        <CodeLabProvider cells={[cell]}>
          <CodeCell cellId={cell.id} />
        </CodeLabProvider>
        <CodeLabProvider cells={[cell]}>
          <CodeCell cellId={cell.id} />
        </CodeLabProvider>
      </>,
    )
    expect(
      [...container.querySelectorAll('.cm-content')].every(
        element => element.getAttribute('contenteditable') === 'false',
      ),
    ).toBe(true)
    screen.getAllByRole('button', { name: 'Run' }).forEach(button => {
      fireEvent.click(button)
    })
    expect(FakeWorker.instances).toHaveLength(2)
    fireEvent.click(screen.getAllByRole('button', { name: 'Stop' })[0] as HTMLElement)
    expect(workerAt(0).terminated).toBe(true)
    expect(workerAt(1).terminated).toBe(false)
  })

  it('keeps a hidden Activity running, reconnects its editor, and releases removed cells', async () => {
    const changed = vi.fn()
    const tree = (visible: boolean, cells: readonly CodeLabCell[]) => (
      <StrictMode>
        <CodeLabProvider cells={cells} onCellChange={changed}>
          <Activity mode={visible ? 'visible' : 'hidden'}>
            <CodeCell cellId={cell.id} />
          </Activity>
        </CodeLabProvider>
      </StrictMode>
    )
    const view = render(tree(true, [cell]))
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    view.rerender(tree(false, [cell]))
    expect(workerAt(0).terminated).toBe(false)
    await act(async () => workerAt(0).complete())
    view.rerender(tree(true, [{ ...cell, source: '99' }]))
    await waitFor(() => expect(view.container.querySelector('.cm-content')?.textContent).toBe('99'))
    expect(screen.getByText('42')).toBeDefined()
    expect(changed).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    view.rerender(tree(true, []))
    expect(workerAt(0).terminated).toBe(true)
    expect(screen.queryByRole('region', { name: 'TypeScript code cell' })).toBeNull()
    view.rerender(tree(true, [cell]))
    const region = screen.getByRole('region', { name: 'TypeScript code cell' })
    expect(within(region).queryByText('42')).toBeNull()
    fireEvent.click(within(region).getByRole('button', { name: 'Run' }))
    view.unmount()
    expect(workerAt(1).terminated).toBe(true)
  })
})
