import { BookOpen, PanelLeftOpen, Plus, Save } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { ConversationPanel } from '../features/conversation/conversation-panel'
import { DocumentTabs } from '../features/reader/document-tabs'
import { ResourcePanel } from '../features/resources/resource-panel'
import { useWorkspace } from './use-workspace'

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
  const workspace = useWorkspace()
  const mode = useSyncExternalStore(subscribeMode, getMode)
  const [materialsOpen, setMaterialsOpen] = useState(true)
  const [assistantOpen, setAssistantOpen] = useState(true)
  const [overlayRequest, setOverlayRequest] = useState<{
    kind: 'materials' | 'assistant'
    mode: string
  } | null>(null)
  const overlay = overlayRequest?.mode === mode ? overlayRequest.kind : null
  const setOverlay = (kind: 'materials' | 'assistant' | null) =>
    setOverlayRequest(kind ? { kind, mode } : null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const railRef = useRef<HTMLButtonElement>(null)
  const inlineMaterials = mode === 'wide' && materialsOpen
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

  const openMaterials = (trigger: HTMLElement) => {
    if (mode === 'wide') setMaterialsOpen(true)
    else {
      triggerRef.current = trigger
      setOverlay('materials')
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
  const quoteSelection = (id: string, text: string) => {
    workspace.addQuote(id, text)
    openAssistant()
    requestAnimationFrame(() => inputRef.current?.focus())
  }
  const closeMaterials = () => {
    if (overlay === 'materials') setOverlay(null)
    else {
      setMaterialsOpen(false)
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
  const materials = (
    <ResourcePanel
      activeId={workspace.activeId}
      onClose={closeMaterials}
      onOpen={id => {
        workspace.openDocument(id)
        if (overlay === 'materials') setOverlay(null)
      }}
    />
  )
  const assistant = (
    <ConversationPanel workspace={workspace} inputRef={inputRef} onClose={closeAssistant} />
  )

  return (
    <div className="workbench">
      {!inlineMaterials && (
        <nav className="materials-rail" aria-label="Workspace controls">
          <BookOpen size={20} aria-label="Gamma Reader" />
          <button
            type="button"
            className="icon-button"
            ref={railRef}
            aria-label="Open materials"
            title="Open materials"
            onClick={event => openMaterials(event.currentTarget)}
          >
            <PanelLeftOpen size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Show material actions"
            title="Show material actions"
            onClick={event => openMaterials(event.currentTarget)}
          >
            <Plus size={18} />
          </button>
          <button
            type="button"
            className="icon-button rail-save"
            aria-label="Save to folder"
            title="Saving is not available yet"
            disabled
          >
            <Save size={17} />
          </button>
        </nav>
      )}
      <Group
        key={`${mode}-${inlineMaterials}-${inlineAssistant}`}
        className="workspace-panels"
        orientation="horizontal"
        resizeTargetMinimumSize={{ fine: 8, coarse: 24 }}
      >
        {inlineMaterials && (
          <>
            <Panel id="materials" defaultSize="240px" minSize="180px" maxSize="360px">
              {materials}
            </Panel>
            <Separator className="panel-separator" aria-label="Resize materials" />
          </>
        )}
        <Panel id="reader" minSize={mode === 'narrow' ? '0px' : '400px'}>
          <DocumentTabs
            workspace={workspace}
            assistantVisible={inlineAssistant}
            onOpenAssistant={openAssistant}
            onQuote={quoteSelection}
          />
        </Panel>
        {inlineAssistant && (
          <>
            <Separator className="panel-separator" aria-label="Resize reading assistant" />
            <Panel id="assistant" defaultSize="360px" minSize="320px">
              {assistant}
            </Panel>
          </>
        )}
      </Group>
      <dialog
        className={`panel-dialog ${overlay ?? ''}`}
        ref={dialogRef}
        aria-label={overlay === 'materials' ? 'Materials panel' : 'Reading assistant panel'}
        onCancel={event => {
          event.preventDefault()
          setOverlay(null)
        }}
      >
        {overlay === 'materials' ? materials : overlay === 'assistant' ? assistant : null}
      </dialog>
    </div>
  )
}
