import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLayoutEffect, useRef, useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { StoredFileMetadata } from '../../core/files'
import { moveStoredFile, updateStoredTextFile, writeStoredTextFile } from '../../data/file-store'
import type { LocalTools } from '../assistant/local-tools'
import { useWorkspace } from './use-workspace'
import { useLocalTools, useReaderBinding, WorkspaceProvider } from './workspace-context'

const files: StoredFileMetadata[] = ['first', 'second'].map(id => ({
  id,
  path: `${id}.pdf`,
  mediaType: 'application/pdf',
  previewKind: 'pdf',
  size: 10,
  lastModified: 0,
  createdAt: 0,
  revision: 1,
}))
const viewport = { startText: 'Visible beginning', endText: 'Visible ending' }

const Reader = ({ fileId, active }: { fileId: string; active: boolean }) => {
  const [page, setPage] = useState(1)
  useReaderBinding({ fileId, getPageNumber: () => page, getViewport: () => viewport }, active)
  return (
    <button type="button" onClick={() => setPage(current => current + 1)}>
      Next page
    </button>
  )
}
const Capture = ({ onTools }: { onTools: (tools: LocalTools) => void }) => {
  const tools = useLocalTools()
  useLayoutEffect(() => {
    onTools(tools)
  }, [onTools, tools])
  return null
}
const Harness = ({
  onTools,
  visible = true,
  blocked = false,
  available = files,
}: {
  onTools: (tools: LocalTools) => void
  visible?: boolean
  blocked?: boolean
  available?: StoredFileMetadata[]
}) => {
  const workspace = useWorkspace(available, false)
  const rootRef = useRef<HTMLDivElement>(null)
  return (
    <WorkspaceProvider
      workspace={workspace}
      rootRef={rootRef}
      writeTextFile={writeStoredTextFile}
      moveFile={moveStoredFile}
      updateTextFile={updateStoredTextFile}
    >
      <div ref={rootRef}>
        <Capture onTools={onTools} />
        {workspace.activeId && (
          <Reader key={workspace.activeId} fileId={workspace.activeId} active={visible} />
        )}
        <button type="button" onClick={() => workspace.openDocument('second')}>
          Open second
        </button>
        <dialog open={blocked} aria-label="Files">
          Files
        </dialog>
      </div>
    </WorkspaceProvider>
  )
}

describe('reader state tools', () => {
  it('reads the latest route, tabs and page from a retained tool reference', async () => {
    const user = userEvent.setup({ delay: null })
    const handles: LocalTools[] = []
    render(
      <MemoryRouter initialEntries={['/files/first']}>
        <Harness onTools={tools => handles.push(tools)} />
      </MemoryRouter>,
    )
    await waitFor(() =>
      expect(handles[0]?.get_reader_state().openFiles).toEqual([
        { id: 'first', path: 'first.pdf', type: 'pdf' },
      ]),
    )
    const tools = handles[0]
    if (!tools) throw new Error('Tools were not provided')
    expect(tools.get_reader_state()).toMatchObject({
      activeFile: { id: 'first', pageNumber: 1 },
      viewport,
    })
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(tools.get_reader_state().activeFile?.pageNumber).toBe(2)
    await user.click(screen.getByRole('button', { name: 'Open second' }))
    expect(tools.get_reader_state()).toEqual({
      openFiles: [
        { id: 'first', path: 'first.pdf', type: 'pdf' },
        { id: 'second', path: 'second.pdf', type: 'pdf' },
      ],
      activeFile: { id: 'second', path: 'second.pdf', type: 'pdf', pageNumber: 1 },
      viewport,
    })
  })

  it('opens a file and resolves once it is the active tab', async () => {
    let tools: LocalTools | undefined
    render(
      <MemoryRouter initialEntries={['/files/first']}>
        <Harness
          onTools={value => {
            tools = value
          }}
        />
      </MemoryRouter>,
    )
    await waitFor(() => expect(tools?.get_reader_state().activeFile?.id).toBe('first'))
    await expect(tools?.open({ fileId: 'missing' })).rejects.toThrow('File not found')
    const state = await tools?.open({ fileId: 'second' })
    expect(state?.activeFile?.id).toBe('second')
    expect(state?.openFiles.map(file => file.id)).toEqual(['first', 'second'])
  })

  it('excludes hidden readers, suppresses covered viewports and drops removed files', async () => {
    let tools: LocalTools | undefined
    const capture = (value: LocalTools) => {
      tools = value
    }
    const view = (visible: boolean, blocked: boolean, available = files) => (
      <MemoryRouter initialEntries={['/files/first']}>
        <Harness onTools={capture} visible={visible} blocked={blocked} available={available} />
      </MemoryRouter>
    )
    const page = render(view(true, false))
    await waitFor(() => expect(tools?.get_reader_state().viewport).toEqual(viewport))
    page.rerender(view(true, true))
    expect(tools?.get_reader_state()).toMatchObject({ activeFile: { id: 'first' }, viewport: null })
    page.rerender(view(false, false))
    expect(tools?.get_reader_state()).toMatchObject({ activeFile: { id: 'first' }, viewport: null })
    expect(tools?.get_reader_state().activeFile).not.toHaveProperty('pageNumber')
    page.rerender(
      view(
        true,
        false,
        files.filter(file => file.id !== 'first'),
      ),
    )
    await waitFor(() =>
      expect(tools?.get_reader_state()).toEqual({
        openFiles: [],
        activeFile: null,
        viewport: null,
      }),
    )
  })

  it('keeps workspace instances independent', async () => {
    const handles: LocalTools[] = []
    const capture = (tools: LocalTools) => {
      handles.push(tools)
    }
    await act(async () => {
      render(
        <>
          <MemoryRouter initialEntries={['/files/first']}>
            <Harness onTools={capture} available={files.slice(0, 1)} />
          </MemoryRouter>
          <MemoryRouter initialEntries={['/files/second']}>
            <Harness onTools={capture} available={files.slice(1)} />
          </MemoryRouter>
        </>,
      )
    })
    expect(handles).toHaveLength(2)
    expect(handles[0]?.get_reader_state().openFiles).toEqual([
      { id: 'first', path: 'first.pdf', type: 'pdf' },
    ])
    expect(handles[1]?.get_reader_state().openFiles).toEqual([
      { id: 'second', path: 'second.pdf', type: 'pdf' },
    ])
  })
})
