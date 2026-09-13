import { ArrowUp, Paperclip, Square } from 'lucide-react'
import { type DragEvent, type RefObject, useLayoutEffect, useRef, useState } from 'react'
import { DraftAttachmentTray } from './conversation-attachments'
import type { DraftAttachment } from './use-draft-attachments'

type ComposerProps = {
  inputRef: RefObject<HTMLTextAreaElement | null>
  draft: string
  phase: 'connecting' | 'ready' | 'unavailable' | 'error' | 'running' | 'stopping'
  attachments: DraftAttachment[]
  limitReached: boolean
  unsettled: boolean
  onDraftChange: (value: string) => void
  onAdd: (files: readonly File[]) => void
  onRetry: (key: string) => void
  onRemove: (key: string) => void
  onOpenFile: (id: string) => void
  onSend: () => void
  onStop: () => void
  availableFileIds: ReadonlySet<string>
}

const resizeTextarea = (textarea: HTMLTextAreaElement) => {
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, 192)}px`
}

export const ConversationComposer = ({
  inputRef,
  draft,
  phase,
  attachments,
  limitReached,
  unsettled,
  onDraftChange,
  onAdd,
  onRetry,
  onRemove,
  onOpenFile,
  onSend,
  onStop,
  availableFileIds,
}: ComposerProps) => {
  const pickerRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const running = phase === 'running' || phase === 'stopping'
  const readyAttachments = attachments.filter(item => item.status === 'ready')
  const hasUnavailable = readyAttachments.some(item => !availableFileIds.has(item.metadata.id))
  const canSend =
    phase === 'ready' &&
    !unsettled &&
    !hasUnavailable &&
    Boolean(draft.trim() || readyAttachments.length)

  useLayoutEffect(() => {
    const textarea = inputRef.current
    if (!textarea) return
    const resize = () => resizeTextarea(textarea)
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(textarea)
    return () => observer.disconnect()
  }, [inputRef])

  const addDroppedFiles = (event: DragEvent<HTMLFieldSetElement>) => {
    event.preventDefault()
    setDragging(false)
    const files = Array.from(event.dataTransfer.files)
    if (files.length) onAdd(files)
  }

  return (
    <fieldset
      aria-label="Message composer"
      className={dragging ? 'composer drop-active' : 'composer'}
      onDragEnter={event => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault()
          setDragging(true)
        }
      }}
      onDragOver={event => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault()
      }}
      onDragLeave={event => {
        const next = event.relatedTarget
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) setDragging(false)
      }}
      onDrop={addDroppedFiles}
    >
      <DraftAttachmentTray
        attachments={attachments}
        onOpen={onOpenFile}
        onRetry={onRetry}
        onRemove={onRemove}
        availableFileIds={availableFileIds}
      />
      <textarea
        ref={inputRef}
        aria-label="Your question"
        placeholder="Ask about what you are reading"
        value={draft}
        onChange={event => {
          resizeTextarea(event.currentTarget)
          onDraftChange(event.target.value)
        }}
        onPaste={event => {
          const files = Array.from(event.clipboardData.files)
          if (!files.length) return
          event.preventDefault()
          onAdd(files)
        }}
        rows={1}
        onKeyDown={event => {
          if (
            event.key !== 'Enter' ||
            event.shiftKey ||
            event.nativeEvent.isComposing ||
            event.keyCode === 229
          )
            return
          event.preventDefault()
          if (canSend) onSend()
        }}
      />
      <div className="composer-bottom">
        <button
          type="button"
          className="icon-button attachment-picker"
          aria-label="Attach files"
          title={limitReached ? 'Remove an attachment before adding another' : 'Attach files'}
          disabled={limitReached || attachments.some(item => item.status === 'adding')}
          onClick={() => pickerRef.current?.click()}
        >
          <Paperclip size={16} />
        </button>
        <input
          ref={pickerRef}
          className="visually-hidden"
          type="file"
          multiple
          aria-label="Choose chat attachments"
          onChange={event => {
            onAdd(Array.from(event.currentTarget.files ?? []))
            event.currentTarget.value = ''
          }}
        />
        {limitReached && <span className="attachment-limit">10 attachments maximum</span>}
        <button
          type="button"
          className="send-button"
          aria-label={running ? 'Stop generation' : 'Send question'}
          title={running ? 'Stop generation' : 'Send question'}
          disabled={phase === 'stopping' || (!running && !canSend)}
          onClick={running ? onStop : onSend}
        >
          {running ? <Square size={13} /> : <ArrowUp size={17} />}
        </button>
      </div>
      {dragging && <span className="drop-hint">Drop files to attach</span>}
    </fieldset>
  )
}
