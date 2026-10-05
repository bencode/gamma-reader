import { ArrowUp, Globe, Paperclip, Square } from 'lucide-react'
import {
  type DragEvent,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { ConversationDraft } from '../../../core/conversations'
import { DraftAttachmentTray } from '../conversation-attachments'
import { ConversationModelControl, type ModelControlProps } from '../model-control'
import type { ConversationTokenUsage } from '../token-usage'
import type { ConversationPhase } from '../use-conversation'
import type { DraftAttachment } from '../use-draft-attachments'
import { QueuedMessages } from './queued-messages'
import {
  commandOptionId,
  isCommandInput,
  matchCommands,
  type SlashCommand,
  SlashCommandMenu,
} from './slash-command-menu'
import styles from './style.module.scss'
import { TokenUsageStatus } from './token-usage-status'

type ComposerProps = {
  modelConfiguration: Pick<ModelControlProps, 'providers' | 'selection'> | null
  onModelChange: ModelControlProps['onModelChange']
  onEffortChange: ModelControlProps['onEffortChange']
  onConfigureModels: ModelControlProps['onConfigure']
  tokenUsage: ConversationTokenUsage | null
  inputRef: RefObject<HTMLTextAreaElement | null>
  draft: string
  phase: ConversationPhase
  queued: readonly ConversationDraft[]
  onRemoveQueued: (index: number) => void
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
  commands: readonly SlashCommand[]
  // Absent where the server has no search service.
  webSearch: { enabled: boolean; set: (on: boolean) => void } | null
}

const resizeTextarea = (textarea: HTMLTextAreaElement) => {
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, 192)}px`
}

export const ConversationComposer = ({
  inputRef,
  modelConfiguration,
  onModelChange,
  onEffortChange,
  onConfigureModels,
  tokenUsage,
  draft,
  phase,
  queued,
  onRemoveQueued,
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
  commands,
  webSearch,
}: ComposerProps) => {
  const pickerRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  // A typed command stays here and never reaches the saved draft. A draft that is not empty was
  // changed from outside (queued messages returned on stop), so it wins.
  // Known glitch, left on purpose: the hidden command shows again once that draft is sent. It is
  // never saved; fix it here if it starts to matter.
  const [typedCommand, setTypedCommand] = useState('')
  const [selected, setSelected] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const menuId = useId()
  const command = draft ? '' : typedCommand
  const value = draft || command
  const matches = command ? matchCommands(command, commands) : []
  const menuOpen = !dismissed && matches.length > 0
  const running = phase === 'running' || phase === 'stopping'
  const readyAttachments = attachments.filter(item => item.status === 'ready')
  const hasUnavailable = readyAttachments.some(item => !availableFileIds.has(item.metadata.id))
  // While a reply runs, sending queues the message.
  const canSend =
    (phase === 'ready' || running) &&
    !unsettled &&
    !hasUnavailable &&
    Boolean(value.trim() || readyAttachments.length)

  useEffect(() => {
    if (phase === 'switching') setTypedCommand('')
  }, [phase])

  useLayoutEffect(() => {
    const textarea = inputRef.current
    if (!textarea) return
    const resize = () => resizeTextarea(textarea)
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(textarea)
    return () => observer.disconnect()
  }, [inputRef])

  const changeText = (text: string) => {
    setSelected(0)
    setDismissed(false)
    if (isCommandInput(text)) {
      setTypedCommand(text)
      if (draft) onDraftChange('')
      return
    }
    setTypedCommand('')
    onDraftChange(text)
  }

  const runCommand = (picked: SlashCommand) => {
    setTypedCommand('')
    picked.run()
  }

  // A command nothing matches, or one whose menu was closed, is sent as an ordinary message.
  const submit = () => {
    if (!canSend) return
    if (command) {
      setTypedCommand('')
      onDraftChange(command)
    }
    onSend()
  }

  const handleMenuKey = (key: string) => {
    const picked = matches[selected]
    if (!picked) return false
    if (key === 'ArrowDown') setSelected((selected + 1) % matches.length)
    else if (key === 'ArrowUp') setSelected((selected - 1 + matches.length) % matches.length)
    else if (key === 'Enter') runCommand(picked)
    else if (key === 'Tab') setTypedCommand(`/${picked.name}`)
    else if (key === 'Escape') setDismissed(true)
    else return false
    return true
  }

  const addDroppedFiles = (event: DragEvent<HTMLFieldSetElement>) => {
    event.preventDefault()
    setDragging(false)
    const files = Array.from(event.dataTransfer.files)
    if (files.length) onAdd(files)
  }

  return (
    <fieldset
      disabled={phase === 'loading' || phase === 'switching'}
      aria-label="Message composer"
      className={`${styles.composer}${dragging ? ` ${styles.dropActive}` : ''}`}
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
      <div className={styles.box}>
        <QueuedMessages queued={queued} onRemove={onRemoveQueued} />
        <DraftAttachmentTray
          attachments={attachments}
          onOpen={onOpenFile}
          onRetry={onRetry}
          onRemove={onRemove}
          availableFileIds={availableFileIds}
        />
        {menuOpen && (
          <SlashCommandMenu id={menuId} commands={matches} selected={selected} onRun={runCommand} />
        )}
        <div className={styles.input}>
          <textarea
            ref={inputRef}
            disabled={phase === 'loading' || phase === 'switching'}
            aria-label="Your question"
            placeholder="Ask about what you are reading, / for commands"
            aria-controls={menuOpen ? menuId : undefined}
            aria-activedescendant={menuOpen ? commandOptionId(menuId, selected) : undefined}
            value={value}
            onChange={event => {
              resizeTextarea(event.currentTarget)
              changeText(event.target.value)
            }}
            onPaste={event => {
              const files = Array.from(event.clipboardData.files)
              if (!files.length) return
              event.preventDefault()
              onAdd(files)
            }}
            rows={1}
            onKeyDown={event => {
              if (event.nativeEvent.isComposing || event.keyCode === 229) return
              if (menuOpen && !event.shiftKey && handleMenuKey(event.key)) {
                event.preventDefault()
                return
              }
              if (event.key === 'Escape' && running) {
                event.preventDefault()
                onStop()
                return
              }
              if (event.key !== 'Enter' || event.shiftKey) return
              event.preventDefault()
              submit()
            }}
          />
          {running && (
            <button
              type="button"
              className={styles.sendButton}
              aria-label="Stop generation"
              title="Stop generation"
              disabled={phase === 'stopping'}
              onClick={onStop}
            >
              <Square size={13} />
            </button>
          )}
          {(!running || canSend) && (
            <button
              type="button"
              className={styles.sendButton}
              aria-label={running ? 'Queue message' : 'Send question'}
              title={running ? 'Queue message' : 'Send question'}
              disabled={!canSend}
              onClick={submit}
            >
              <ArrowUp size={17} />
            </button>
          )}
        </div>
        {dragging && <span className={styles.dropHint}>Drop files to attach</span>}
      </div>
      <div className={styles.bottom}>
        <button
          type="button"
          className={`icon-button ${styles.attachmentPicker}`}
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
        {webSearch && (
          <button
            type="button"
            className={`icon-button ${styles.attachmentPicker} ${styles.webSearch}`}
            aria-label="Search the web"
            aria-pressed={webSearch.enabled}
            title={webSearch.enabled ? 'Web search is on' : 'Web search is off'}
            onClick={() => webSearch.set(!webSearch.enabled)}
          >
            <Globe size={16} />
          </button>
        )}
        {modelConfiguration && (
          <ConversationModelControl
            {...modelConfiguration}
            disabled={phase !== 'ready'}
            onModelChange={onModelChange}
            onEffortChange={onEffortChange}
            onConfigure={onConfigureModels}
          />
        )}
        {limitReached && <span className={styles.attachmentLimit}>10 attachments maximum</span>}
        {tokenUsage && <TokenUsageStatus usage={tokenUsage} />}
      </div>
    </fieldset>
  )
}
