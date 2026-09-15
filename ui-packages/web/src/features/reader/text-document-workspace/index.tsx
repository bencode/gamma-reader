import {
  lazy,
  Suspense,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from 'react'
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels'
import type { SourceLanguage } from '../../../components/source-editor'
import type { StoredFileMetadata } from '../../../core/files'
import type { Workspace } from '../../../shell/use-workspace'
import { useWorkspaceSource, useWorkspaceSourceActions } from '../../../shell/workspace-context'
import type { TextReaderComponent } from '../text-file-reader'
import styles from './style.module.scss'

const SourceEditor = lazy(() =>
  import('../../../components/source-editor').then(module => ({ default: module.SourceEditor })),
)

const narrowQuery = '(max-width: 799px)'
const subscribeNarrow = (notify: () => void) => {
  const query = matchMedia(narrowQuery)
  query.addEventListener('change', notify)
  return () => query.removeEventListener('change', notify)
}
const narrowSnapshot = () => matchMedia(narrowQuery).matches

type TextDocumentWorkspaceProps = {
  document: StoredFileMetadata
  persistedContent: string
  sourceLanguage: SourceLanguage
  Preview: TextReaderComponent
  files: readonly StoredFileMetadata[]
  active: boolean
  scrollPositions: Workspace['scrollPositions']
}

export const TextDocumentWorkspace = ({
  document,
  persistedContent,
  sourceLanguage,
  Preview,
  files,
  active,
  scrollPositions,
}: TextDocumentWorkspaceProps) => {
  const draft = useWorkspaceSource(document.id)
  const actions = useWorkspaceSourceActions()
  const previewPanelRef = usePanelRef()
  const sourcePanelRef = usePanelRef()
  const narrow = useSyncExternalStore(subscribeNarrow, narrowSnapshot)
  const [sourceMounted, setSourceMounted] = useState(false)

  useLayoutEffect(() => {
    actions.synchronizeSource(document.id, {
      revision: document.revision,
      content: persistedContent,
    })
  }, [actions, document.id, document.revision, persistedContent])

  useEffect(() => {
    if (draft?.sourceOpen) setSourceMounted(true)
  }, [draft?.sourceOpen])

  const sourceOpen = draft?.sourceOpen ?? false
  useEffect(() => {
    if (!sourceMounted) return
    const frame = requestAnimationFrame(() => {
      if (narrow) {
        if (sourceOpen) {
          previewPanelRef.current?.collapse()
          sourcePanelRef.current?.resize('100%')
        } else {
          sourcePanelRef.current?.collapse()
          previewPanelRef.current?.resize('100%')
        }
        return
      }
      previewPanelRef.current?.expand()
      if (sourceOpen) sourcePanelRef.current?.expand()
      else sourcePanelRef.current?.collapse()
    })
    return () => cancelAnimationFrame(frame)
  }, [sourceOpen, narrow, previewPanelRef, sourceMounted, sourcePanelRef])

  useEffect(() => {
    if (!active || !draft) return
    const save = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return
      event.preventDefault()
      if (draft.savePhase === 'idle' && draft.content !== draft.base.content)
        void actions.saveSource(document.id)
    }
    window.addEventListener('keydown', save)
    return () => window.removeEventListener('keydown', save)
  }, [actions, active, document.id, draft])

  const previewContent = useDeferredValue(draft?.content ?? persistedContent)
  if (!draft) return <div className="preview-state">Preparing source…</div>
  const previewActive = active && (!narrow || !draft.sourceOpen)

  return (
    <Group className={styles.workspace} orientation="horizontal">
      <Panel
        id={`preview-${document.id}`}
        panelRef={previewPanelRef}
        minSize={narrow ? 0 : '220px'}
        collapsible={narrow}
      >
        <div
          className={styles.previewPanel}
          aria-hidden={!previewActive}
          inert={!previewActive ? true : undefined}
        >
          <Suspense fallback={<div className="preview-state">Preparing preview…</div>}>
            <Preview
              document={document}
              content={previewContent}
              files={files}
              active={previewActive}
              scrollPositions={scrollPositions}
            />
          </Suspense>
        </div>
      </Panel>
      {sourceMounted && (
        <>
          <Separator
            className={draft.sourceOpen && !narrow ? styles.separator : styles.hiddenSeparator}
            aria-label="Resize source"
            disabled={!draft.sourceOpen || narrow}
          />
          <Panel
            id={`source-${document.id}`}
            panelRef={sourcePanelRef}
            defaultSize="42%"
            minSize={narrow ? 0 : '220px'}
            collapsedSize={0}
            collapsible
            onResize={size => {
              if (!narrow && size.asPercentage === 0 && draft.sourceOpen)
                actions.setSourceOpen(document.id, false)
            }}
          >
            <section
              className={styles.sourcePanel}
              aria-label={`${document.name} source editor`}
              aria-hidden={!draft.sourceOpen}
              inert={!draft.sourceOpen ? true : undefined}
            >
              <header className={styles.sourceHeader}>
                <strong>Source</strong>
                {draft.savePhase === 'saving' && <span role="status">Saving…</span>}
              </header>
              {draft.incoming ? (
                <div className={styles.sourceNotice} role="alert">
                  <span>The saved copy changed.</span>
                  <button
                    type="button"
                    disabled={draft.savePhase === 'saving'}
                    onClick={() => actions.reloadIncomingSource(document.id)}
                  >
                    Reload saved copy
                  </button>
                  <button
                    type="button"
                    disabled={draft.savePhase === 'saving'}
                    onClick={() => void actions.saveSource(document.id, true)}
                  >
                    Overwrite with draft
                  </button>
                </div>
              ) : draft.saveError ? (
                <div className={styles.sourceNotice} role="alert">
                  {draft.saveError}
                </div>
              ) : null}
              <div className={styles.editor}>
                <Suspense fallback={<div className="preview-state">Opening source…</div>}>
                  <SourceEditor
                    name={document.name}
                    value={draft.content}
                    language={sourceLanguage}
                    active={active && draft.sourceOpen}
                    onChange={content => actions.updateSource(document.id, content)}
                  />
                </Suspense>
              </div>
            </section>
          </Panel>
        </>
      )}
    </Group>
  )
}
