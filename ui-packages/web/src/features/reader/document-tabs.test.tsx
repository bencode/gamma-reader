import { render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { StoredFileMetadata } from '../../core/files'
import type { Workspace } from '../../shell/use-workspace'
import { createWorkspaceStore } from '../../shell/workspace-context'
import { DocumentTabs } from './document-tabs'

const previewMounts = vi.hoisted(() => new Map<string, number>())

vi.mock('./file-preview', () => ({
  FilePreview: ({ document }: { document: StoredFileMetadata }) => {
    const instance = useRef<number | undefined>(undefined)
    if (instance.current === undefined) {
      const next = (previewMounts.get(document.id) ?? 0) + 1
      previewMounts.set(document.id, next)
      instance.current = next
    }
    return <div data-testid={`preview-${document.id}`}>{instance.current}</div>
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

const workspace = (activeId: string): Workspace => ({
  store: createWorkspaceStore(files.map(file => file.id)),
  tabs: files.map(file => file.id),
  files,
  filesLoading: false,
  activeId,
  scrollPositions,
  openDocument: vi.fn(),
  closeDocument: vi.fn(),
})

describe('document tab lifecycles', () => {
  it('keeps the same PDF instance while another document is active', () => {
    const view = render(
      <DocumentTabs workspace={workspace('pdf')} assistantVisible onOpenAssistant={vi.fn()} />,
    )

    expect(screen.getByTestId('preview-pdf')).toHaveTextContent('1')

    view.rerender(
      <DocumentTabs workspace={workspace('image')} assistantVisible onOpenAssistant={vi.fn()} />,
    )
    expect(screen.getByTestId('preview-pdf')).not.toBeVisible()
    expect(screen.getByTestId('preview-image')).toBeInTheDocument()

    view.rerender(
      <DocumentTabs workspace={workspace('pdf')} assistantVisible onOpenAssistant={vi.fn()} />,
    )
    expect(screen.getByTestId('preview-pdf')).toHaveTextContent('1')
  })
})
