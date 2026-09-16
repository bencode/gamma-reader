import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EditorView } from 'codemirror'
import { StrictMode, useLayoutEffect, useRef } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoredFileMetadata } from '../../../core/files'
import type { LocalTools } from '../../../core/local-tools'
import {
  getStoredFileContent,
  updateStoredTextFile,
  writeStoredTextFile,
} from '../../../data/file-store'
import { useWorkspace, type Workspace } from '../../../shell/use-workspace'
import { useLocalTools, WorkspaceProvider } from '../../../shell/workspace-context'
import { DocumentTabs } from '../document-tabs'
import { parseLabDocument } from './document-model'

class FakeWorker {
  static instances: FakeWorker[] = []
  requests: { requestId: string; source: string }[] = []
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  terminated = false
  constructor() {
    FakeWorker.instances.push(this)
  }
  postMessage(request: { requestId: string; source: string }) {
    this.requests.push(request)
  }
  terminate() {
    this.terminated = true
  }
  complete(text: string) {
    const request = this.requests.at(-1)
    if (!request) throw new Error('No running request')
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

type Handles = { workspace: Workspace; tools: LocalTools }
const Capture = ({
  workspace,
  onReady,
}: {
  workspace: Workspace
  onReady: (handles: Handles) => void
}) => {
  const tools = useLocalTools()
  useLayoutEffect(() => onReady({ workspace, tools }), [onReady, tools, workspace])
  return null
}
const Harness = ({
  files,
  onReady,
}: {
  files: StoredFileMetadata[]
  onReady: (handles: Handles) => void
}) => {
  const workspace = useWorkspace(files, false)
  const rootRef = useRef<HTMLDivElement>(null)
  return (
    <WorkspaceProvider
      workspace={workspace}
      rootRef={rootRef}
      writeTextFile={writeStoredTextFile}
      updateTextFile={updateStoredTextFile}
    >
      <div ref={rootRef}>
        <Capture workspace={workspace} onReady={onReady} />
        <DocumentTabs workspace={workspace} assistantVisible onOpenAssistant={vi.fn()} />
      </div>
    </WorkspaceProvider>
  )
}

const workerAt = (index: number) => {
  const worker = FakeWorker.instances[index]
  if (!worker) throw new Error('Worker not started')
  return worker
}

beforeEach(() => {
  const matchMedia = window.matchMedia
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
    ...matchMedia(query),
    matches: false,
  }))
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
  Range.prototype.getClientRects = () => [new DOMRect(0, 0, 100, 20)] as unknown as DOMRectList
})

describe('Lab document integration', () => {
  it('normalizes once in StrictMode, shares edits with Source and agent tools, and saves explicitly', async () => {
    const original = '# Lab\n\n\\[x^2\\]\n\n```typescript run\n1 + 1\n```\n\nKeep this paragraph.'
    const file = await writeStoredTextFile('Example.lab.md', original)
    let handles: Handles | undefined
    render(
      <StrictMode>
        <MemoryRouter initialEntries={[`/files/${file.id}`]}>
          <Harness
            files={[file]}
            onReady={next => {
              handles = next
            }}
          />
        </MemoryRouter>
      </StrictMode>,
    )
    const run = await screen.findByRole('button', { name: 'Run' }, { timeout: 5000 })
    if (!handles) throw new Error('Workspace not mounted')
    const { tools } = handles
    const normalized = tools.read_active_source().content
    const id = parseLabDocument(normalized).cells[0]?.id
    expect(id).toMatch(/^[\w-]{8}$/)
    expect(FakeWorker.instances).toHaveLength(0)
    expect(await (await getStoredFileContent(file.id))?.text()).toBe(original)
    expect(screen.getByRole('img', { name: 'Unsaved changes' })).toBeVisible()
    expect(document.querySelector('.katex')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Source' }))
    const sourceElement = await screen.findByRole('textbox', { name: 'Example.lab.md source' })
    const cell = screen.getByRole('region', { name: 'TypeScript code cell' })
    const editor = EditorView.findFromDOM(within(cell).getByRole('textbox', { name: 'Code' }))
    if (!editor) throw new Error('Code editor missing')
    act(() =>
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: '6 * 7' } }),
    )
    expect(tools.read_active_source().content).toBe(normalized.replace('1 + 1', '6 * 7'))
    expect(EditorView.findFromDOM(sourceElement)?.state.doc.toString()).toBe(
      normalized.replace('1 + 1', '6 * 7'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Source' }))
    fireEvent.click(run)
    expect(workerAt(0).requests[0]?.source).toBe('6 * 7')
    await act(async () => workerAt(0).complete('42'))
    expect(within(cell).getByText('42')).toBeVisible()
    const read = tools.read_active_source()
    act(() =>
      tools.edit_active_source({
        fileId: file.id,
        expectedVersion: read.version,
        oldText: '6 * 7',
        newText: '40 + 2',
      }),
    )
    expect(await screen.findByText('Code changed · Run again')).toBeVisible()
    expect(parseLabDocument(tools.read_active_source().content).cells[0]?.id).toBe(id)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(async () =>
      expect(await (await getStoredFileContent(file.id))?.text()).toBe(
        tools.read_active_source().content,
      ),
    )
    expect(tools.get_reader_state().activeFile?.source?.dirty).toBe(false)
  })

  it('keeps independent environments through tab switches and releases a closed document', async () => {
    const source = '# Lab\n\n```typescript run id=shared\n21 * 2\n```'
    const first = await writeStoredTextFile('First.lab.md', source)
    const second = await writeStoredTextFile('Second.lab.md', source)
    let handles: Handles | undefined
    render(
      <MemoryRouter initialEntries={[`/files/${first.id}`]}>
        <Harness
          files={[first, second]}
          onReady={next => {
            handles = next
          }}
        />
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Run' }))
    if (!handles) throw new Error('Workspace not mounted')
    act(() => handles?.workspace.openDocument(second.id))
    fireEvent.click(await screen.findByRole('button', { name: 'Run' }))
    expect(FakeWorker.instances).toHaveLength(2)
    expect(workerAt(0).terminated).toBe(false)
    await act(async () => workerAt(0).complete('first result'))
    expect(within(screen.getByRole('tabpanel')).queryByText('first result')).toBeNull()
    act(() => handles?.workspace.openDocument(first.id))
    expect(await screen.findByText('first result')).toBeVisible()
    const previous = handles.tools.read_active_source()
    act(() =>
      handles?.tools.edit_active_source({
        fileId: first.id,
        expectedVersion: previous.version,
        oldText: '# Lab',
        newText: '# Moved\n\n```typescript run id=before\n1\n```',
      }),
    )
    expect(screen.getByText('first result')).toBeVisible()
    expect(
      within(
        screen.getAllByRole('region', { name: 'TypeScript code cell' })[0] as HTMLElement,
      ).queryByText('first result'),
    ).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(handles?.tools.get_reader_state().activeFile?.source?.dirty).toBe(false),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close First.lab.md' }))
    await waitFor(() => expect(workerAt(0).terminated).toBe(true))
    expect(workerAt(1).terminated).toBe(false)
    await act(async () => workerAt(1).complete('second result'))
    expect(await screen.findByText('second result')).toBeVisible()
  })

  it('renders diagnostics and static code without running invalid cells or ordinary Markdown', async () => {
    const file = await writeStoredTextFile(
      'Invalid.lab.md',
      '# Lab\n\n```python run id=same\n1\n```\n\n```python run id=same\n2\n```\n\n```ruby run\n3\n```',
    )
    const ordinary = await writeStoredTextFile(
      'Ordinary.md',
      '```typescript run id=ordinary\n21 * 2\n```',
    )
    let handles: Handles | undefined
    render(
      <MemoryRouter initialEntries={[`/files/${file.id}`]}>
        <Harness
          files={[file, ordinary]}
          onReady={next => {
            handles = next
          }}
        />
      </MemoryRouter>,
    )
    expect(await screen.findAllByText(/Duplicate cell id/)).toHaveLength(2)
    expect(screen.getByText(/Supported languages/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull()
    act(() => handles?.workspace.openDocument(ordinary.id))
    expect(await screen.findByText('21', { exact: false })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull()
    expect(FakeWorker.instances).toHaveLength(0)
  })
})
