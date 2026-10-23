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
import {
  type ConversationDraft,
  type ConversationId,
  conversationNumber,
  type StoredConversation,
} from '../../../core/conversations'
import type { FileReference } from '../../../core/reader-message'
import { DraftAttachmentTray } from '../conversation-attachments'
import { ConversationModelControl, type ModelControlProps } from '../model-control'
import type { ConversationTokenUsage } from '../token-usage'
import type { ConversationPhase } from '../use-conversation'
import type { DraftAttachment } from '../use-draft-attachments'
import {
  conversationMentionAt,
  conversationOption,
  rankConversations,
} from './conversation-mentions'
import { fileOption, rankMentions, referencedFiles } from './file-mentions'
import { MentionMenu } from './mention-menu'
import { insertMention, type Mention, mentionAt } from './mentions'
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
  onSend: (references: FileReference[]) => void
  onStop: () => void
  availableFileIds: ReadonlySet<string>
  // The project's files, offered after an @.
  files: readonly FileReference[]
  // Newest first; recently opened files lead the @ list.
  recentFileIds: readonly string[]
  // The project's conversations, offered after a #; read each time a # starts.
  loadConversations: () => Promise<StoredConversation[]>
  activeConversationId: ConversationId
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
  files,
  recentFileIds,
  loadConversations,
  activeConversationId,
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
  // The caret belongs to the text it was read in. A draft replaced from outside has no caret here,
  // and so no mention, until the reader types or moves the caret.
  const [caret, setCaret] = useState({ text: '', at: 0 })
  // Where the caret goes once a picked file or conversation is in the draft.
  const [pendingCaret, setPendingCaret] = useState<number | null>(null)
  const [conversations, setConversations] = useState<readonly StoredConversation[]>([])
  const menuId = useId()
  const command = draft ? '' : typedCommand
  const value = draft || command
  const matches = command ? matchCommands(command, commands) : []
  const caretKnown = Boolean(draft) && caret.text === draft
  const mention = caretKnown ? mentionAt('@', draft, caret.at) : null
  const fileMatches = mention ? rankMentions(files, mention.query, recentFileIds) : []
  const conversationMention = caretKnown ? conversationMentionAt(draft, caret.at) : null
  const conversationMatches = conversationMention
    ? rankConversations(conversations, conversationMention.query, activeConversationId)
    : []
  // A command is typed into an empty draft, and the caret ends an @ or a # but never both, so one
  // list at most.
  const options = matches.length || fileMatches.length || conversationMatches.length
  const menuOpen = !dismissed && options > 0
  // A summary can be stopped like a reply, but accepts no new messages.
  const running = phase === 'running' || phase === 'stopping' || phase === 'compacting'
  const readyAttachments = attachments.filter(item => item.status === 'ready')
  const hasUnavailable = readyAttachments.some(item => !availableFileIds.has(item.metadata.id))
  // While a reply runs, sending queues the message.
  const canSend =
    (phase === 'ready' || phase === 'running') &&
    !unsettled &&
    !hasUnavailable &&
    Boolean(value.trim() || readyAttachments.length)

  useEffect(() => {
    if (phase === 'switching') setTypedCommand('')
  }, [phase])

  // Read again at each #, so the list holds conversations begun since the last one.
  const mentioningConversation = conversationMention !== null
  useEffect(() => {
    if (!mentioningConversation) return
    let current = true
    loadConversations().then(
      list => {
        if (current) setConversations(list)
      },
      cause => console.error('Unable to list conversations', cause),
    )
    return () => {
      current = false
    }
  }, [mentioningConversation, loadConversations])

  useLayoutEffect(() => {
    const textarea = inputRef.current
    if (!textarea) return
    const resize = () => resizeTextarea(textarea)
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(textarea)
    return () => observer.disconnect()
  }, [inputRef])

  useLayoutEffect(() => {
    const textarea = inputRef.current
    if (pendingCaret === null || !textarea) return
    textarea.setSelectionRange(pendingCaret, pendingCaret)
    setCaret({ text: textarea.value, at: pendingCaret })
    setPendingCaret(null)
  }, [inputRef, pendingCaret])

  // Moving to another place can change the list, so the highlight starts over.
  const readCaret = (textarea: HTMLTextAreaElement) => {
    if (textarea.value !== caret.text || textarea.selectionStart !== caret.at) setSelected(0)
    setCaret({ text: textarea.value, at: textarea.selectionStart })
  }

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

  const insert = (at: Mention | null, token: string) => {
    if (!at) return
    const next = insertMention(draft, caret.at, at, token)
    onDraftChange(next.text)
    setPendingCaret(next.caret)
  }

  const pickFile = (index: number) => {
    const file = fileMatches[index]
    if (file) insert(mention, `@${file.path}`)
  }

  const pickConversation = (index: number) => {
    const conversation = conversationMatches[index]
    if (conversation) insert(conversationMention, `#${conversationNumber(conversation.id)}`)
  }

  // A command nothing matches, or one whose menu was closed, is sent as an ordinary message.
  const submit = () => {
    if (!canSend) return
    if (command) {
      setTypedCommand('')
      onDraftChange(command)
    }
    onSend(referencedFiles(value, files))
  }

  const choose = (key: string) => {
    const picked = matches[selected]
    if (fileMatches[selected]) pickFile(selected)
    else if (conversationMatches[selected]) pickConversation(selected)
    else if (picked && key === 'Enter') runCommand(picked)
    else if (picked) setTypedCommand(`/${picked.name}`)
  }

  const handleMenuKey = (key: string) => {
    if (key === 'ArrowDown') setSelected((selected + 1) % options)
    else if (key === 'ArrowUp') setSelected((selected - 1 + options) % options)
    else if (key === 'Enter' || key === 'Tab') choose(key)
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
        {menuOpen && matches.length > 0 && (
          <SlashCommandMenu id={menuId} commands={matches} selected={selected} onRun={runCommand} />
        )}
        {menuOpen && fileMatches.length > 0 && (
          <MentionMenu
            id={menuId}
            label="Files"
            options={fileMatches.map(fileOption)}
            selected={selected}
            onPick={pickFile}
          />
        )}
        {menuOpen && conversationMatches.length > 0 && (
          <MentionMenu
            id={menuId}
            label="Conversations"
            options={conversationMatches.map(conversationOption)}
            selected={selected}
            onPick={pickConversation}
          />
        )}
        <div className={styles.input}>
          <textarea
            ref={inputRef}
            disabled={phase === 'loading' || phase === 'switching'}
            aria-label="Your question"
            placeholder="Ask about what you are reading, @ for files, # for conversations, / for commands"
            aria-controls={menuOpen ? menuId : undefined}
            aria-activedescendant={menuOpen ? commandOptionId(menuId, selected) : undefined}
            value={value}
            onChange={event => {
              resizeTextarea(event.currentTarget)
              readCaret(event.currentTarget)
              changeText(event.target.value)
            }}
            onSelect={event => readCaret(event.currentTarget)}
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
              title="Stop generation (Esc)"
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
          title={
            limitReached
              ? 'Remove an attachment before adding another'
              : 'Attach files — or paste or drop them here'
          }
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
