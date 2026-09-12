import { BookOpen, PanelLeft, Plus, Save } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { ConversationProvider } from '../features/conversation/conversation-context'
import { ConversationPanel } from '../features/conversation/conversation-panel'
import { DocumentTabs } from '../features/reader/document-tabs'
import { ResourcePanel } from '../features/resources/resource-panel'
import { useFileLibrary } from '../features/resources/use-file-library'
import { usePanelWidths } from './use-panel-widths'
import { useWorkspace } from './use-workspace'
import { WorkspaceProvider } from './workspace-context'

const queries = ['(min-width: 1100px)', '(min-width: 800px)'] as const
const getMode = () =>
  window.matchMedia(queries[0]).matches
    ? 'wide'
    : window.matchMedia(queries[1]).matches
      ? 'medium'
      : 'narrow'
const subscribeMode = (notify: () => void) => {
  const media = queries.map(query => window.matchMedia(query))
  media.forEach(query => {
    query.addEventListener('change', notify)
  })
  return () =>
    media.forEach(query => {
      query.removeEventListener('change', notify)
    })
}

export const Workbench = () => {
  const rootRef = useRef<HTMLDivElement>(null)
  const library = useFileLibrary()
  const workspace = useWorkspace(library.files, library.loading)
  const { widths, saveWidths } = usePanelWidths()
  const groupElementRef = useRef<HTMLDivElement>(null)
  const mode = useSyncExternalStore(subscribeMode, getMode)
  const [filesOpen, setFilesOpen] = useState(true)
  const [assistantOpen, setAssistantOpen] = useState(true)
  const [overlayRequest, setOverlayRequest] = useState<{
    kind: 'files' | 'assistant'
    mode: string
  } | null>(null)
  const overlay = overlayRequest?.mode === mode ? overlayRequest.kind : null
  const setOverlay = (kind: 'files' | 'assistant' | null) =>
    setOverlayRequest(kind ? { kind, mode } : null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const railRef = useRef<HTMLButtonElement>(null)
  const inlineFiles = mode === 'wide' && filesOpen
  const inlineAssistant = mode !== 'narrow' && assistantOpen

  useEffect(() => {
    if (overlayRequest && overlayRequest.mode !== mode) setOverlayRequest(null)
  }, [mode, overlayRequest])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!overlay || !dialog) return
    dialog.showModal()
    return () => {
      dialog.close()
      const trigger = triggerRef.current
      if (trigger?.isConnected) trigger.focus()
      else railRef.current?.focus()
    }
  }, [overlay])

  const openFiles = (trigger: HTMLElement) => {
    if (mode === 'wide') setFilesOpen(true)
    else {
      triggerRef.current = trigger
      setOverlay('files')
    }
  }
  const openAssistant = (trigger?: HTMLElement) => {
    if (mode !== 'narrow') setAssistantOpen(true)
    else {
      triggerRef.current =
        trigger ?? document.querySelector('[aria-label="Open reading assistant"]')
      setOverlay('assistant')
    }
  }
  const closeFiles = () => {
    if (overlay === 'files') setOverlay(null)
    else {
      setFilesOpen(false)
      requestAnimationFrame(() => railRef.current?.focus())
    }
  }
  const closeAssistant = () => {
    if (overlay === 'assistant') setOverlay(null)
    else {
      setAssistantOpen(false)
      requestAnimationFrame(() =>
        document.querySelector<HTMLButtonElement>('[aria-label="Open reading assistant"]')?.focus(),
      )
    }
  }
  const files = (
    <ResourcePanel
      activeId={workspace.activeId}
      library={library}
      onClose={closeFiles}
      onOpen={id => {
        workspace.openDocument(id)
        if (overlay === 'files') setOverlay(null)
      }}
      onRemoved={workspace.closeDocument}
    />
  )
  const assistant = (
    <ConversationPanel
      inputRef={inputRef}
      onClose={closeAssistant}
      availableFileIds={new Set(library.files.map(file => file.id))}
      onOpenFile={id => {
        workspace.openDocument(id)
        if (overlay === 'assistant') setOverlay(null)
      }}
    />
  )

  return (
    <WorkspaceProvider workspace={workspace} rootRef={rootRef}>
      <ConversationProvider addAttachments={library.addAttachments}>
        <div className="workbench" ref={rootRef}>
          {!inlineFiles && (
            <nav className="files-rail" aria-label="Workspace controls">
              <button
                type="button"
                className="icon-button rail-brand"
                ref={railRef}
                aria-label="Open files"
                title="Open files"
                onClick={event => openFiles(event.currentTarget)}
              >
                <BookOpen className="rail-logo" size={19} aria-hidden="true" />
                <PanelLeft className="rail-expand" size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Show file actions"
                title="Show file actions"
                onClick={event => openFiles(event.currentTarget)}
              >
                <Plus size={18} />
              </button>
              <button
                type="button"
                className="icon-button rail-save"
                aria-label="Save to folder"
                title="Saving is not available yet. Reloading clears the conversation and draft."
                disabled
              >
                <Save size={17} />
              </button>
            </nav>
          )}
          <Group
            key={`${mode}-${inlineFiles}-${inlineAssistant}`}
            className="workspace-panels"
            elementRef={groupElementRef}
            orientation="horizontal"
            resizeTargetMinimumSize={{ fine: 8, coarse: 24 }}
            onLayoutChanged={(layout, meta) => {
              const group = groupElementRef.current
              if (!meta.isUserInteraction || !group) return
              const availableWidth = Array.from(group.children)
                .filter(child => child.hasAttribute('data-panel'))
                .reduce((total, panel) => total + panel.getBoundingClientRect().width, 0)
              saveWidths({
                ...(layout.files !== undefined
                  ? { files: (availableWidth * layout.files) / 100 }
                  : {}),
                ...(layout.assistant !== undefined
                  ? { assistant: (availableWidth * layout.assistant) / 100 }
                  : {}),
              })
            }}
          >
            {inlineFiles && (
              <>
                <Panel
                  id="files"
                  defaultSize={widths.files}
                  minSize="140px"
                  groupResizeBehavior="preserve-pixel-size"
                >
                  {files}
                </Panel>
                <Separator className="panel-separator" aria-label="Resize files" />
              </>
            )}
            <Panel id="reader" minSize={mode === 'narrow' ? '0px' : '240px'}>
              <DocumentTabs
                workspace={workspace}
                assistantVisible={inlineAssistant}
                onOpenAssistant={openAssistant}
              />
            </Panel>
            {inlineAssistant && (
              <>
                <Separator className="panel-separator" aria-label="Resize reading assistant" />
                <Panel
                  id="assistant"
                  defaultSize={widths.assistant}
                  minSize="220px"
                  groupResizeBehavior="preserve-pixel-size"
                >
                  {assistant}
                </Panel>
              </>
            )}
          </Group>
          <dialog
            className={`panel-dialog ${overlay ?? ''}`}
            ref={dialogRef}
            aria-label={overlay === 'files' ? 'Files panel' : 'Reading assistant panel'}
            onCancel={event => {
              event.preventDefault()
              setOverlay(null)
            }}
          >
            {overlay === 'files' ? files : overlay === 'assistant' ? assistant : null}
          </dialog>
        </div>
      </ConversationProvider>
    </WorkspaceProvider>
  )
}
