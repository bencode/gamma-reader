import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { StoredFileMetadata } from '../../core/files'
import { updateStoredTextFile, writeStoredTextFile } from '../../data/file-store'
import type { Workspace } from '../../shell/use-workspace'
import { WorkspaceProvider } from '../../shell/workspace-context'
import { createWorkspaceActions, createWorkspaceStore } from '../../shell/workspace-store'
import { DocumentTabs } from './document-tabs'

const previewMounts = vi.hoisted(() => new Map<string, number>())

vi.mock('./file-preview', () => ({
  FilePreview: ({
    document,
    textReader,
  }: {
    document: StoredFileMetadata
    textReader?: unknown
  }) => {
    const instance = useRef<number | undefined>(undefined)
    if (instance.current === undefined) {
      const next = (previewMounts.get(document.id) ?? 0) + 1
      previewMounts.set(document.id, next)
      instance.current = next
    }
    return (
      <div data-testid={`preview-${document.id}`} data-reader={textReader ? 'custom' : 'default'}>
        {instance.current}
      </div>
    )
  },
}))

const storedFile = (
  id: string,
  name: string,
  previewKind: StoredFileMetadata['previewKind'],
): StoredFileMetadata => ({
  id,
  name,
  collection: 'files',
  mediaType: previewKind === 'pdf' ? 'application/pdf' : 'image/png',
  previewKind,
  size: 1,
  lastModified: 1,
  createdAt: 1,
  revision: 1,
})

const pdfFile = storedFile('pdf', 'Guide.pdf', 'pdf')
const imageFile = storedFile('image', 'Figure.png', 'image')
const files = [pdfFile, imageFile]
const scrollPositions = { current: new Map<string, number>() }

const workspace = (activeId: string): Workspace => {
  const store = createWorkspaceStore(files.map(file => file.id))
  return {
    store,
    actions: createWorkspaceActions(store),
    tabs: files.map(file => file.id),
    files,
    filesLoading: false,
    activeId,
    scrollPositions,
    openDocument: vi.fn(),
    closeDocument: vi.fn(),
    closeDocuments: vi.fn(),
  }
}

const TestTabs = ({
  workspace,
  updateTextFile = updateStoredTextFile,
}: {
  workspace: Workspace
  updateTextFile?: typeof updateStoredTextFile
}) => {
  const rootRef = useRef<HTMLDivElement>(null)
  return (
    <WorkspaceProvider
      workspace={workspace}
      rootRef={rootRef}
      writeTextFile={writeStoredTextFile}
      updateTextFile={updateTextFile}
    >
      <div ref={rootRef}>
        <DocumentTabs workspace={workspace} assistantVisible onOpenAssistant={vi.fn()} />
      </div>
    </WorkspaceProvider>
  )
}

describe('document tab lifecycles', () => {
  it('keeps the same PDF instance while another document is active', () => {
    const view = render(<TestTabs workspace={workspace('pdf')} />)

    expect(screen.getByTestId('preview-pdf')).toHaveTextContent('1')

    view.rerender(<TestTabs workspace={workspace('image')} />)
    expect(screen.getByTestId('preview-pdf')).not.toBeVisible()
    expect(screen.getByTestId('preview-image')).toBeInTheDocument()

    view.rerender(<TestTabs workspace={workspace('pdf')} />)
    expect(screen.getByTestId('preview-pdf')).toHaveTextContent('1')
    view.rerender(<TestTabs workspace={{ ...workspace('pdf'), tabs: ['pdf'] }} />)
    expect(screen.getByTestId('preview-pdf')).toHaveTextContent('1')
    expect(screen.queryByTestId('preview-image')).toBeNull()
  })

  it('provides text capabilities for p5 but not binary images', () => {
    const p5 = storedFile('p5', 'Orbit.p5.js', 'text')
    const javascript = storedFile('javascript', 'Figure.png', 'image')
    const p5Workspace = {
      ...workspace('p5'),
      store: createWorkspaceStore([p5.id, javascript.id]),
      files: [p5, javascript],
      tabs: [p5.id, javascript.id],
    }

    render(<TestTabs workspace={p5Workspace} />)

    expect(screen.getByTestId('preview-p5')).toHaveAttribute('data-reader', 'custom')
    expect(screen.getByTestId('preview-javascript')).toHaveAttribute('data-reader', 'default')
  })
  it('mounts a Lab scope only after activation and removes it when its tab closes', async () => {
    const lab = storedFile('lab', 'Lesson.LAB.MD', 'markdown')
    const image = storedFile('figure', 'Figure.png', 'image')
    const initial = { ...workspace(image.id), files: [lab, image], tabs: [lab.id, image.id] }
    const view = render(<TestTabs workspace={initial} />)
    expect(screen.queryByTestId('preview-lab')).toBeNull()
    view.rerender(<TestTabs workspace={{ ...initial, activeId: lab.id }} />)
    expect(await screen.findByTestId('preview-lab', {}, { timeout: 5000 })).toHaveAttribute(
      'data-reader',
      'custom',
    )
    view.rerender(<TestTabs workspace={initial} />)
    expect(screen.getByTestId('preview-lab')).not.toBeVisible()
    view.rerender(<TestTabs workspace={{ ...initial, tabs: [image.id] }} />)
    expect(screen.queryByTestId('preview-lab')).toBeNull()
  })
})

describe('document tab controls', () => {
  it('reveals a tab when it becomes active and leaves manual scrolling alone afterward', () => {
    const current = workspace('pdf')
    const view = render(<TestTabs workspace={current} />)
    const strip = screen.getByRole('tablist')
    const imageTab = screen.getByRole('tab', { name: 'Figure.png' }).parentElement
    if (!imageTab) throw new Error('Figure tab container is missing')
    strip.getBoundingClientRect = () => new DOMRect(100, 0, 200, 40)
    imageTab.getBoundingClientRect = () => new DOMRect(340, 0, 120, 40)

    view.rerender(<TestTabs workspace={{ ...current, activeId: 'image' }} />)
    expect(strip.scrollLeft).toBe(160)

    strip.scrollLeft = 0
    view.rerender(<TestTabs workspace={{ ...current, activeId: 'image' }} />)
    expect(strip.scrollLeft).toBe(0)
  })

  it('reveals a newly mounted active tab', () => {
    const current = workspace('pdf')
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.getAttribute('role') === 'tablist') return new DOMRect(100, 0, 200, 40)
      if (this.querySelector('[title="Figure.png"]')) return new DOMRect(340, 0, 120, 40)
      return new DOMRect(100, 0, 120, 40)
    })
    const view = render(<TestTabs workspace={{ ...current, tabs: ['pdf'] }} />)
    const strip = screen.getByRole('tablist')

    view.rerender(<TestTabs workspace={{ ...current, activeId: 'image' }} />)
    expect(strip.scrollLeft).toBe(160)
  })

  it('searches open files and selects a result without closing any documents', async () => {
    const user = userEvent.setup({ delay: null })
    const current = workspace('pdf')
    render(<TestTabs workspace={current} />)
    await user.click(screen.getByRole('button', { name: 'Show open documents' }))
    const input = screen.getByRole('textbox', { name: 'Find an open document' })
    expect(input).toHaveFocus()
    await user.type(input, 'FIGURE')
    const results = within(screen.getByRole('list', { name: 'Open document results' }))
    expect(results.queryByRole('button', { name: 'Guide.pdf' })).toBeNull()
    await user.click(results.getByRole('button', { name: 'Figure.png' }))
    expect(current.openDocument).toHaveBeenCalledWith('image')
    expect(current.closeDocuments).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox', { name: 'Find an open document' })).toBeNull()
  })

  it('keeps inactive right-click targets inactive and disables empty close operations', async () => {
    const user = userEvent.setup({ delay: null })
    const current = workspace('pdf')
    render(<TestTabs workspace={current} />)
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'Figure.png' }))
    expect(current.openDocument).not.toHaveBeenCalled()
    expect(screen.getByRole('menuitem', { name: 'Close to the right' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await user.click(screen.getByRole('menuitem', { name: 'Close others' }))
    expect(current.closeDocuments).toHaveBeenCalledWith(['pdf'])
  })

  it('opens the context menu from the keyboard and restores focus on Escape', async () => {
    const user = userEvent.setup({ delay: null })
    render(<TestTabs workspace={workspace('pdf')} />)
    const tab = screen.getByRole('tab', { name: 'Guide.pdf' })
    await user.click(tab)
    await user.keyboard('{Shift>}{F10}{/Shift}')
    expect(screen.getByRole('menuitem', { name: 'Close others' })).toBeVisible()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(tab).toHaveFocus())
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it.each(['conflict', 'missing'] as const)(
    'retains all tabs after a partial save ends with %s',
    async status => {
      const user = userEvent.setup({ delay: null })
      const current = workspace('pdf')
      current.tabs.forEach(id => {
        current.actions.synchronizeSource(id, { revision: 1, content: 'original' })
        current.actions.updateSource(id, 'changed')
      })
      const updateTextFile = vi
        .fn<typeof updateStoredTextFile>()
        .mockResolvedValueOnce({ status: 'saved', metadata: { ...pdfFile, revision: 2 } })
        .mockResolvedValueOnce({ status })
        .mockResolvedValueOnce({ status: 'saved', metadata: { ...imageFile, revision: 2 } })
      render(<TestTabs workspace={current} updateTextFile={updateTextFile} />)
      fireEvent.contextMenu(screen.getByRole('tab', { name: /Guide.pdf/ }))
      await user.click(screen.getByRole('menuitem', { name: 'Close all' }))
      const dialog = within(await screen.findByRole('dialog'))
      await user.click(await dialog.findByRole('button', { name: 'Save and close' }))
      expect(await dialog.findByRole('alert')).toBeVisible()
      expect(current.closeDocuments).not.toHaveBeenCalled()
      expect(screen.getAllByRole('tab')).toHaveLength(2)
      const retry = within(await screen.findByRole('dialog'))
      await user.click(await retry.findByRole('button', { name: 'Save and close' }))
      await waitFor(() => expect(current.closeDocuments).toHaveBeenCalledWith(['pdf', 'image']))
      expect(updateTextFile.mock.calls.map(([id]) => id)).toEqual(['pdf', 'image', 'image'])
    },
  )

  it('cancels or discards a dirty batch without saving', async () => {
    const user = userEvent.setup({ delay: null })
    const current = workspace('pdf')
    current.actions.synchronizeSource('pdf', { revision: 1, content: 'original' })
    current.actions.updateSource('pdf', 'changed')
    const updateTextFile = vi.fn<typeof updateStoredTextFile>()
    render(<TestTabs workspace={current} updateTextFile={updateTextFile} />)
    fireEvent.contextMenu(screen.getByRole('tab', { name: /Guide.pdf/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Close all' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(current.closeDocuments).not.toHaveBeenCalled()
    expect(current.store.getState().sourceDrafts.pdf?.content).toBe('changed')
    expect(screen.getByRole('tab', { name: /Guide.pdf/ })).toHaveFocus()
    fireEvent.contextMenu(screen.getByRole('tab', { name: /Guide.pdf/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Close all' }))
    await user.click(screen.getByRole('button', { name: 'Discard and close' }))
    expect(current.closeDocuments).toHaveBeenCalledWith(['pdf', 'image'])
    expect(updateTextFile).not.toHaveBeenCalled()
  })
})
