import * as Tabs from '@radix-ui/react-tabs'
import { BookOpen, Code2, MessageSquare, Save } from 'lucide-react'
import { lazy, useEffect, useRef, useState } from 'react'
import type { StoredFileMetadata } from '../../core/files'
import type { Workspace } from '../../shell/use-workspace'
import { useSourceDrafts, useWorkspaceSourceActions } from '../../shell/workspace-context'
import { sourceDirty } from '../../shell/workspace-store'
import { DocumentPane } from './document-pane'
import { DocumentTabBar } from './document-tab-bar'
import type { PdfSourceCacheEntry } from './file-preview'
import { HtmlReader } from './html-reader'
import { SvgReader } from './image-reader'
import { MarkdownReader } from './markdown-reader'
import { StandardMarkdownReader } from './markdown-reader/standard-reader'
import { isP5SourceName } from './p5-file'
import type { TextReaderDefinition } from './text-file-reader'
import { UnsavedSourceDialog } from './unsaved-source-dialog'

const P5FileReader = lazy(() =>
  import('./p5-file-reader').then(module => ({ default: module.P5FileReader })),
)

const LabReader = lazy(() => import('./lab-reader').then(module => ({ default: module.LabReader })))
const LabDocumentScope = lazy(() =>
  import('./lab-reader/document-scope').then(module => ({ default: module.LabDocumentScope })),
)
const labReader: TextReaderDefinition = {
  Preview: LabReader,
  Scope: LabDocumentScope,
  sourceLanguage: 'markdown',
}

const markdownReader: TextReaderDefinition = {
  Preview: StandardMarkdownReader,
  sourceLanguage: 'markdown',
}
const plainReader: TextReaderDefinition = { Preview: MarkdownReader, sourceLanguage: 'plain' }
const jsReader: TextReaderDefinition = { Preview: MarkdownReader, sourceLanguage: 'javascript' }
const tsReader: TextReaderDefinition = { Preview: MarkdownReader, sourceLanguage: 'typescript' }
const p5Reader: TextReaderDefinition = { Preview: P5FileReader, sourceLanguage: 'javascript' }
const htmlReader: TextReaderDefinition = { Preview: HtmlReader, sourceLanguage: 'plain' }
const svgReader: TextReaderDefinition = { Preview: SvgReader, sourceLanguage: 'plain' }

const textReaderFor = (file: StoredFileMetadata): TextReaderDefinition | undefined => {
  if (file.name.toLowerCase().endsWith('.lab.md')) return labReader
  if (isP5SourceName(file.name)) return p5Reader
  if (file.previewKind === 'markdown') return markdownReader
  if (file.previewKind === 'html') return htmlReader
  if (file.name.toLowerCase().endsWith('.svg') || file.mediaType === 'image/svg+xml')
    return svgReader
  if (/\.(?:js|jsx|mjs|cjs)$/i.test(file.name)) return jsReader
  if (/\.(?:ts|tsx)$/i.test(file.name)) return tsReader
  if (file.previewKind === 'text') return plainReader
  return undefined
}

type TabFocusTarget =
  | { kind: 'select'; id: string }
  | { kind: 'close'; ids: readonly string[] }
  | { kind: 'restore'; element: HTMLElement | null }

type DocumentTabsProps = {
  workspace: Workspace
  assistantVisible: boolean
  onOpenAssistant: (trigger: HTMLElement) => void
}

export const DocumentTabs = ({
  workspace,
  assistantVisible,
  onOpenAssistant,
}: DocumentTabsProps) => {
  const drafts = useSourceDrafts()
  const actions = useWorkspaceSourceActions()
  const activeDraft = workspace.activeId ? drafts[workspace.activeId] : undefined
  const [pendingCloseIds, setPendingCloseIds] = useState<readonly string[] | null>(null)
  const focusTargetRef = useRef<HTMLButtonElement>(null)
  const emptyReaderRef = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef<TabFocusTarget | null>(null)
  const closeOrigin = useRef<HTMLElement | null>(null)
  const close = (ids: readonly string[]) => {
    pendingFocus.current = { kind: 'close', ids }
    workspace.closeDocuments(ids)
    setPendingCloseIds(null)
  }
  const requestClose = (ids: readonly string[]) => {
    const current = workspace.store.getState()
    const targets = ids.filter(id => current.tabs.includes(id))
    if (!targets.length) return
    if (
      targets.some(
        id =>
          sourceDirty(current.sourceDrafts[id]) || current.sourceDrafts[id]?.savePhase === 'saving',
      )
    ) {
      closeOrigin.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      setPendingCloseIds(targets)
    } else close(targets)
  }
  const items = workspace.tabs.flatMap(id => {
    const file = workspace.files.find(file => file.id === id)
    return file ? [{ id, name: file.name, dirty: sourceDirty(drafts[id]) }] : []
  })
  const pdfSources = useRef(new Map<string, PdfSourceCacheEntry>())

  useEffect(() => {
    const openIds = new Set(workspace.tabs)
    pdfSources.current.forEach((source, id) => {
      if (openIds.has(id)) return
      URL.revokeObjectURL(source.url)
      pdfSources.current.delete(id)
    })
  }, [workspace.tabs])

  useEffect(
    () => () => {
      pdfSources.current.forEach(source => {
        URL.revokeObjectURL(source.url)
      })
      pdfSources.current.clear()
    },
    [],
  )

  useEffect(() => {
    const target = pendingFocus.current
    if (!target) return
    if (target.kind === 'select' && workspace.activeId !== target.id) return
    if (
      target.kind === 'close' &&
      (target.ids.some(id => workspace.tabs.includes(id)) ||
        (workspace.activeId && target.ids.includes(workspace.activeId)))
    )
      return
    pendingFocus.current = null
    const element =
      target.kind === 'restore' && target.element?.isConnected
        ? target.element
        : (focusTargetRef.current ?? emptyReaderRef.current)
    element?.focus({ preventScroll: true })
  })

  return (
    <Tabs.Root
      className="reading-panel"
      value={workspace.activeId ?? ''}
      onValueChange={workspace.openDocument}
    >
      <div className="tabs-header">
        <DocumentTabBar
          items={items}
          activeId={workspace.activeId}
          activeTriggerRef={focusTargetRef}
          onSelect={id => {
            pendingFocus.current = { kind: 'select', id }
            workspace.openDocument(id)
            if (workspace.activeId === id) {
              pendingFocus.current = null
              focusTargetRef.current?.focus({ preventScroll: true })
            }
          }}
          onRequestClose={requestClose}
        />
        {activeDraft && workspace.activeId && (
          <div className="source-controls">
            <button
              type="button"
              className={activeDraft.sourceOpen ? 'toolbar-button active' : 'toolbar-button'}
              aria-pressed={activeDraft.sourceOpen}
              onClick={() =>
                actions.setSourceOpen(workspace.activeId as string, !activeDraft.sourceOpen)
              }
            >
              <Code2 size={14} />
              Source
            </button>
            <button
              type="button"
              className="toolbar-button"
              disabled={!sourceDirty(activeDraft) || activeDraft.savePhase === 'saving'}
              title="Save to browser (⌘/Ctrl+S)"
              onClick={() => void actions.saveSource(workspace.activeId as string)}
            >
              <Save size={14} />
              {activeDraft.savePhase === 'saving' ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
        {!assistantVisible && (
          <button
            type="button"
            className="icon-button assistant-open"
            aria-label="Open reading assistant"
            title="Open reading assistant"
            onClick={event => onOpenAssistant(event.currentTarget)}
          >
            <MessageSquare size={18} />
          </button>
        )}
      </div>
      <main className="reading-body" aria-label="Document reader">
        {workspace.filesLoading ? (
          <div className="preview-state" role="status">
            Opening Files…
          </div>
        ) : workspace.activeId === null ? (
          <div className="empty-reader" ref={emptyReaderRef} tabIndex={-1}>
            <BookOpen size={30} strokeWidth={1.4} />
            <h1>Start with a document</h1>
            <p>Open a sample from Files, or add your own.</p>
            {workspace.files[0] && (
              <button
                type="button"
                className="text-button"
                ref={focusTargetRef}
                onClick={() => workspace.openDocument(workspace.files[0]?.id ?? '')}
              >
                Open {workspace.files[0].name}
              </button>
            )}
          </div>
        ) : null}
        {workspace.tabs.map(id => {
          const source = workspace.files.find(document => document.id === id)
          return source ? (
            <DocumentPane
              key={id}
              document={source}
              files={workspace.files}
              active={workspace.activeId === id}
              scrollPositions={workspace.scrollPositions}
              pdfSources={pdfSources}
              textReader={textReaderFor(source)}
            />
          ) : null
        })}
      </main>
      {pendingCloseIds && (
        <UnsavedSourceDialog
          fileIds={pendingCloseIds}
          workspace={workspace}
          onCancel={() => {
            setPendingCloseIds(null)
            pendingFocus.current = { kind: 'restore', element: closeOrigin.current }
          }}
          onClose={() => close(pendingCloseIds)}
        />
      )}
    </Tabs.Root>
  )
}
