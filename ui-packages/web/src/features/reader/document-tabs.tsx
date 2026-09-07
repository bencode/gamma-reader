import * as Tabs from '@radix-ui/react-tabs'
import { BookOpen, MessageSquare, X } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import { samples } from '../../core/samples'
import type { Workspace } from '../../shell/use-workspace'
import { MarkdownReader } from './markdown-reader'

type DocumentTabsProps = {
  workspace: Workspace
  assistantVisible: boolean
  onOpenAssistant: (trigger: HTMLElement) => void
  onQuote: (documentId: string, text: string) => void
}

export const DocumentTabs = ({
  workspace,
  assistantVisible,
  onOpenAssistant,
  onQuote,
}: DocumentTabsProps) => {
  const focusTargetRef = useRef<HTMLButtonElement>(null)
  const restoreFocusRef = useRef(false)

  useLayoutEffect(() => {
    if (!restoreFocusRef.current) return
    restoreFocusRef.current = false
    focusTargetRef.current?.focus()
  })

  return (
    <Tabs.Root
      className="reading-panel"
      value={workspace.activeId ?? ''}
      onValueChange={workspace.setActiveId}
    >
      <div className="tabs-header">
        <Tabs.List className="document-tabs" aria-label="Open documents">
          {workspace.tabs.map(id => {
            const source = samples.find(document => document.id === id)
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
                  {source.title}
                </Tabs.Trigger>
                <button
                  type="button"
                  className="tab-close icon-button"
                  aria-label={`Close ${source.title}`}
                  onClick={() => {
                    restoreFocusRef.current = true
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
        {workspace.tabs.length === 0 ? (
          <div className="empty-reader">
            <BookOpen size={30} strokeWidth={1.4} />
            <h1>A place for your next question</h1>
            <p>Choose a document from Materials to start reading.</p>
            <button
              type="button"
              className="text-button"
              ref={focusTargetRef}
              onClick={() => workspace.openDocument('getting-started')}
            >
              Open Getting started
            </button>
          </div>
        ) : (
          workspace.tabs.map(id => {
            const source = samples.find(document => document.id === id)
            return source ? (
              <Tabs.Content
                key={id}
                value={id}
                className="document-pane"
                forceMount
                hidden={workspace.activeId !== id}
              >
                <MarkdownReader
                  document={source}
                  active={workspace.activeId === id}
                  scrollPositions={workspace.scrollPositions}
                  onQuote={onQuote}
                />
              </Tabs.Content>
            ) : null
          })
        )}
      </main>
    </Tabs.Root>
  )
}
