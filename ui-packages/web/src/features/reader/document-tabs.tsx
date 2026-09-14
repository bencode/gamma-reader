import * as Tabs from '@radix-ui/react-tabs'
import { BookOpen, MessageSquare, X } from 'lucide-react'
import { Activity, useEffect, useLayoutEffect, useRef } from 'react'
import type { Workspace } from '../../shell/use-workspace'
import { FilePreview, type PdfSourceCacheEntry } from './file-preview'

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
                </Tabs.Trigger>
                <button
                  type="button"
                  className="tab-close icon-button"
                  aria-label={`Close ${source.name}`}
                  onClick={() => {
                    closingTabRef.current = id
                    workspace.closeDocument(id)
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            )
          })}
        </Tabs.List>
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
                />
              </Tabs.Content>
            </Activity>
          ) : null
        })}
      </main>
    </Tabs.Root>
  )
}
