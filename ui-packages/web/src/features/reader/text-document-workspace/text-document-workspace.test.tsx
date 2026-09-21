import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorView } from 'codemirror'
import { Activity, useLayoutEffect, useMemo, useRef } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SourceEditor } from '../../../components/source-editor'
import type { StoredFileMetadata } from '../../../core/files'
import {
  getStoredFile,
  getStoredFileContent,
  updateStoredTextFile,
  writeStoredTextFile,
} from '../../../data/file-store'
import { useWorkspace, type Workspace } from '../../../shell/use-workspace'
import {
  useLocalTools,
  useWorkspaceSourceActions,
  WorkspaceProvider,
} from '../../../shell/workspace-context'
import type { LocalTools } from '../../agent/local-tools'
import { MarkdownReader } from '../markdown-reader'
import { TextFileReader, type TextReaderDefinition } from '../text-file-reader'

const definition: TextReaderDefinition = { Preview: MarkdownReader, sourceLanguage: 'markdown' }
type Handles = {
  tools: LocalTools
  actions: ReturnType<typeof useWorkspaceSourceActions>
  workspace: Workspace
}
const Capture = ({
  workspace,
  onReady,
}: {
  workspace: Workspace
  onReady: (handles: Handles) => void
}) => {
  const tools = useLocalTools()
  const actions = useWorkspaceSourceActions()
  useLayoutEffect(
    () => onReady({ tools, actions, workspace }),
    [actions, onReady, tools, workspace],
  )
  return null
}
const Harness = ({
  file,
  blob,
  visible = true,
  onReady,
}: {
  file: StoredFileMetadata
  blob: Blob
  visible?: boolean
  onReady: (handles: Handles) => void
}) => {
  const files = useMemo(() => [file], [file])
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
        {workspace.tabs.includes(file.id) && (
          <Activity mode={visible ? 'visible' : 'hidden'}>
            <TextFileReader
              document={file}
              blob={blob}
              files={[file]}
              active={visible}
              scrollPositions={workspace.scrollPositions}
              textReader={definition}
            />
          </Activity>
        )}
      </div>
    </WorkspaceProvider>
  )
}

describe('text source workspace', () => {
  beforeEach(() => {
    Range.prototype.getClientRects = () => [new DOMRect(0, 0, 100, 20)] as unknown as DOMRectList
  })

  it('shares the draft with retained tools, preserves it through Activity, and saves explicitly', async () => {
    const file = await writeStoredTextFile('Guide.md', '# Original')
    const blob = new Blob(['# Original'])
    let handles: Handles | undefined
    const onReady = (next: Handles) => {
      handles = next
    }
    const page = (visible: boolean) => (
      <MemoryRouter initialEntries={[`/files/${file.id}`]}>
        <Harness file={file} blob={blob} visible={visible} onReady={onReady} />
      </MemoryRouter>
    )
    const view = render(page(true))
    await screen.findByRole('heading', { name: 'Original' })
    if (!handles) throw new Error('Tools not available')
    const original = handles
    const read = original.tools.read_active_source()
    act(() =>
      original.tools.edit_active_source({
        fileId: read.fileId,
        expectedVersion: read.version,
        oldText: '# Original',
        newText: '# Edited',
      }),
    )
    expect(original.tools.read_active_source().content).toBe('# Edited')
    expect(await (await getStoredFileContent(file.id))?.text()).toBe('# Original')
    expect(await screen.findByRole('heading', { name: 'Edited' })).toBeVisible()
    view.rerender(page(false))
    view.rerender(page(true))
    expect(await screen.findByRole('heading', { name: 'Edited' })).toBeVisible()
    expect(handles.tools).toBe(original.tools)
    await act(() => original.actions.saveSource(file.id))
    expect(await (await getStoredFileContent(file.id))?.text()).toBe('# Edited')
    expect(original.tools.get_reader_state().activeFile?.source?.dirty).toBe(false)
  })

  it('rejects retained edit requests and cursors after saving, closing, and reopening', async () => {
    const content = `# Reopened\n\nTarget\n${'context\n'.repeat(210)}`
    const file = await writeStoredTextFile('Reopened.md', content)
    let handles: Handles | undefined
    const onReady = (next: Handles) => {
      handles = next
    }
    const page = (metadata: StoredFileMetadata, blob: Blob) => (
      <MemoryRouter initialEntries={[`/files/${file.id}`]}>
        <Harness file={metadata} blob={blob} onReady={onReady} />
      </MemoryRouter>
    )
    const view = render(page(file, new Blob([content])))
    await screen.findByRole('heading', { name: 'Reopened' })
    if (!handles) throw new Error('Tools not available')
    const tools = handles.tools
    const oldRead = tools.read_active_source()
    if (!oldRead.next) throw new Error('Expected a continuation cursor')
    act(() => handles?.actions.updateSource(file.id, `${content}Saved edit`))
    await act(() => handles?.actions.saveSource(file.id))
    const saved = await getStoredFile(file.id)
    if (!saved) throw new Error('Saved file not found')
    await act(() => handles?.workspace.closeDocument(file.id))
    await waitFor(() => expect(tools.get_reader_state().activeFile).toBeNull())
    view.rerender(page(saved.metadata, saved.blob))
    act(() => handles?.workspace.openDocument(file.id))
    await screen.findByRole('heading', { name: 'Reopened' })
    expect(handles.tools).toBe(tools)
    expect(() => tools.read_active_source(oldRead.next ?? {})).toThrow('Source changed')
    const edit = { fileId: file.id, oldText: 'Target', newText: 'Updated target' }
    expect(() => tools.edit_active_source({ ...edit, expectedVersion: oldRead.version })).toThrow(
      'Source changed',
    )
    const current = tools.read_active_source()
    expect(current.version).not.toBe(oldRead.version)
    act(() => tools.edit_active_source({ ...edit, expectedVersion: current.version }))
    expect(tools.read_active_source().content).toContain('Updated target')
    expect(await (await getStoredFileContent(file.id))?.text()).toBe(`${content}Saved edit`)
  })

  it('keeps conflicting drafts until the user chooses to overwrite the latest saved revision', async () => {
    const file = await writeStoredTextFile('Conflict.md', '# Original')
    let handles: Handles | undefined
    const onReady = (next: Handles) => {
      handles = next
    }
    render(
      <MemoryRouter initialEntries={[`/files/${file.id}`]}>
        <Harness file={file} blob={new Blob(['# Original'])} onReady={onReady} />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'Original' })
    if (!handles) throw new Error('Tools not available')
    const current = handles
    act(() => current.actions.updateSource(file.id, '# Local draft'))
    await writeStoredTextFile(file.name, '# External change')
    await act(async () => expect(await current.actions.saveSource(file.id)).toBe('conflict'))
    expect(current.tools.read_active_source().content).toBe('# Local draft')
    expect(await (await getStoredFileContent(file.id))?.text()).toBe('# External change')
    await act(async () => expect(await current.actions.saveSource(file.id, true)).toBe('saved'))
    expect(await (await getStoredFileContent(file.id))?.text()).toBe('# Local draft')
    expect(current.tools.get_reader_state().activeFile?.source?.dirty).toBe(false)
  })

  it('retains the editor selection and undo history when Activity reconnects', async () => {
    const file = await writeStoredTextFile('Editor.txt', 'original')
    const blob = new Blob(['original'])
    let handles: Handles | undefined
    const onReady = (next: Handles) => {
      handles = next
    }
    const page = (visible: boolean) => (
      <MemoryRouter initialEntries={[`/files/${file.id}`]}>
        <Harness file={file} blob={blob} visible={visible} onReady={onReady} />
      </MemoryRouter>
    )
    const view = render(page(true))
    await screen.findByText('original')
    if (!handles) throw new Error('Tools not available')
    act(() => handles?.actions.setSourceOpen(file.id, true))
    const editor = await screen.findByRole('textbox', { name: 'Editor.txt source' })
    const user = userEvent.setup({ delay: null })
    await user.click(editor)
    await user.keyboard('{Control>}a{/Control}changed')
    await waitFor(() => expect(handles?.tools.read_active_source().content).toContain('changed'))
    const content = handles.tools.read_active_source().content
    view.rerender(page(false))
    view.rerender(page(true))
    const restored = await screen.findByRole('textbox', { name: 'Editor.txt source' })
    expect(restored).toHaveTextContent(content)
    await user.click(restored)
    await user.keyboard('{Control>}z{/Control}')
    await waitFor(() => expect(handles?.tools.read_active_source().content).not.toBe(content))
  })

  it('does not undo host synchronization when undoing a user edit', async () => {
    const changed = vi.fn()
    const editorFor = (value: string) => (
      <SourceEditor
        name="Lesson.lab.md"
        value={value}
        language="markdown"
        active
        onChange={changed}
      />
    )
    const page = render(editorFor('```python run\n1\n```'))
    const element = await screen.findByRole('textbox', { name: 'Lesson.lab.md source' })
    const editor = EditorView.findFromDOM(element)
    if (!editor) throw new Error('Editor not ready')
    act(() => editor.dispatch({ changes: { from: 0, insert: '# Title\n\n' } }))
    page.rerender(editorFor('# Title\n\n```python run id=stable\n1\n```'))
    await waitFor(() => expect(editor.state.doc.toString()).toContain('id=stable'))
    fireEvent.keyDown(element, { key: 'z', code: 'KeyZ', ctrlKey: true })
    await waitFor(() => expect(editor.state.doc.toString()).toBe('```python run id=stable\n1\n```'))
    expect(changed).toHaveBeenLastCalledWith('```python run id=stable\n1\n```')
  })

  it('restarts decoding when Activity interrupts an unfinished read', async () => {
    const file = await writeStoredTextFile('Delayed.md', '# Restored')
    const content = new TextEncoder().encode('# Restored').buffer
    let finish: (value: ArrayBuffer) => void = () => undefined
    const first = new Promise<ArrayBuffer>(resolve => {
      finish = resolve
    })
    const arrayBuffer = vi.fn().mockReturnValueOnce(first).mockResolvedValue(content)
    const blob = { arrayBuffer } as unknown as Blob
    const onReady = () => undefined
    const page = (visible: boolean) => (
      <MemoryRouter initialEntries={[`/files/${file.id}`]}>
        <Harness file={file} blob={blob} visible={visible} onReady={onReady} />
      </MemoryRouter>
    )
    const view = render(page(true))
    view.rerender(page(false))
    await act(() => finish(content))
    view.rerender(page(true))
    expect(await screen.findByRole('heading', { name: 'Restored' })).toBeVisible()
    expect(arrayBuffer).toHaveBeenCalledTimes(2)
  })
})
