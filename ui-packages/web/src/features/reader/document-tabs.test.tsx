import { render, screen } from '@testing-library/react'
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

const files = [storedFile('pdf', 'Guide.pdf', 'pdf'), storedFile('image', 'Figure.png', 'image')]
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
  }
}

const TestTabs = ({ workspace }: { workspace: Workspace }) => {
  const rootRef = useRef<HTMLDivElement>(null)
  return (
    <WorkspaceProvider
      workspace={workspace}
      rootRef={rootRef}
      writeTextFile={writeStoredTextFile}
      updateTextFile={updateStoredTextFile}
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
})
