import * as Tabs from '@radix-ui/react-tabs'
import { BookOpen, Code2, MessageSquare, Save, X } from 'lucide-react'
import { Activity, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { StoredFileMetadata } from '../../core/files'
import type { Workspace } from '../../shell/use-workspace'
import { useSourceDrafts, useWorkspaceSourceActions } from '../../shell/workspace-context'
import { sourceDirty } from '../../shell/workspace-store'
import { FilePreview, type PdfSourceCacheEntry } from './file-preview'
import { HtmlReader } from './html-reader'
import { SvgReader } from './image-reader'
import { MarkdownReader } from './markdown-reader'
import { isP5SourceName } from './p5-file'
import type { TextReaderDefinition } from './text-file-reader'
import { UnsavedSourceDialog } from './unsaved-source-dialog'

const P5FileReader = lazy(() =>
  import('./p5-file-reader').then(module => ({ default: module.P5FileReader })),
)

const markdownReader: TextReaderDefinition = { Preview: MarkdownReader, sourceLanguage: 'markdown' }
const plainReader: TextReaderDefinition = { Preview: MarkdownReader, sourceLanguage: 'plain' }
const jsReader: TextReaderDefinition = { Preview: MarkdownReader, sourceLanguage: 'javascript' }
const tsReader: TextReaderDefinition = { Preview: MarkdownReader, sourceLanguage: 'typescript' }
const p5Reader: TextReaderDefinition = { Preview: P5FileReader, sourceLanguage: 'javascript' }
const htmlReader: TextReaderDefinition = { Preview: HtmlReader, sourceLanguage: 'plain' }
const svgReader: TextReaderDefinition = { Preview: SvgReader, sourceLanguage: 'plain' }

const textReaderFor = (file: StoredFileMetadata): TextReaderDefinition | undefined => {
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
  const [closeCandidate, setCloseCandidate] = useState<string | null>(null)
  const candidate = workspace.files.find(file => file.id === closeCandidate)
  const close = (id: string) => {
    closingTabRef.current = id
    workspace.closeDocument(id)
    setCloseCandidate(null)
  }
  const focusTargetRef = useRef<HTMLButtonElement>(null)
  const closingTabRef = useRef<string | null>(null)
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

  useLayoutEffect(() => {
    const closing = closingTabRef.current
    if (!closing || workspace.tabs.includes(closing) || workspace.activeId === closing) return
    closingTabRef.current = null
    focusTargetRef.current?.focus()
  })

  return (
    <Tabs.Root
      className="reading-panel"
      value={workspace.activeId ?? ''}
      onValueChange={workspace.openDocument}
    >
      <div className="tabs-header">
        <Tabs.List className="document-tabs" aria-label="Open documents">
          {workspace.tabs.map(id => {
            const source = workspace.files.find(document => document.id === id)
            if (!source) return null
            return (
              <div
                className={workspace.activeId === id ? 'document-tab active' : 'document-tab'}
                key={id}
              >
                <Tabs.Trigger
                  value={id}
                  title={source.name}
                  ref={workspace.activeId === id ? focusTargetRef : undefined}
                >
                  {source.name}
                  {sourceDirty(drafts[id]) && (
                    <span className="source-dirty" role="img" aria-label="Unsaved changes">
                      {' '}
                      ●
                    </span>
                  )}
                </Tabs.Trigger>
                <button
                  type="button"
                  className="tab-close icon-button"
                  aria-label={`Close ${source.name}`}
                  onClick={() => {
                    if (sourceDirty(drafts[id]) || drafts[id]?.savePhase === 'saving')
                      setCloseCandidate(id)
                    else close(id)
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            )
          })}
        </Tabs.List>
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
          <div className="empty-reader">
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
            <Activity key={id} mode={workspace.activeId === id ? 'visible' : 'hidden'}>
              <Tabs.Content value={id} className="document-pane" forceMount>
                <FilePreview
                  document={source}
                  files={workspace.files}
                  active={workspace.activeId === id}
                  scrollPositions={workspace.scrollPositions}
                  pdfSources={pdfSources}
                  textReader={textReaderFor(source)}
                />
              </Tabs.Content>
            </Activity>
          ) : null
        })}
      </main>
      {candidate && (
        <UnsavedSourceDialog
          fileId={candidate.id}
          name={candidate.name}
          workspace={workspace}
          onCancel={() => setCloseCandidate(null)}
          onClose={() => close(candidate.id)}
        />
      )}
    </Tabs.Root>
  )
}
