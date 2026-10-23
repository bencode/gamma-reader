import { ArrowUp, Square } from 'lucide-react'
import { type RefObject, useEffect, useId, useLayoutEffect, useState } from 'react'
import type { ConversationId, StoredConversation } from '../../../core/conversations'
import type { FileReference } from '../../../core/reader-message'
import type { ConversationPhase } from '../use-conversation'
import { composerMenu, menuQuery } from './draft-menu'
import { referencedFiles } from './file-mentions'
import { MentionMenu } from './mention-menu'
import { insertMention } from './mentions'
import {
  commandOptionId,
  isCommandInput,
  type SlashCommand,
  SlashCommandMenu,
} from './slash-command-menu'
import styles from './style.module.scss'

type DraftInputProps = {
  inputRef: RefObject<HTMLTextAreaElement | null>
  draft: string
  phase: ConversationPhase
  onDraftChange: (value: string) => void
  onSend: (references: FileReference[]) => void
  onStop: () => void
  // Pasted files become attachments.
  onAdd: (files: readonly File[]) => void
  files: readonly FileReference[]
  recentFileIds: readonly string[]
  loadConversations: () => Promise<StoredConversation[]>
  activeConversationId: ConversationId
  commands: readonly SlashCommand[]
  // Ready attachments can be sent without text; unsettled or unavailable ones hold sending back.
  attachmentsReady: boolean
  sendBlocked: boolean
}

const resizeTextarea = (textarea: HTMLTextAreaElement) => {
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, 192)}px`
}

// The text the reader writes, the command, @ and # lists it opens, and sending or stopping.
export const DraftInput = ({
  inputRef,
  draft,
  phase,
  onDraftChange,
  onSend,
  onStop,
  onAdd,
  files,
  recentFileIds,
  loadConversations,
  activeConversationId,
  commands,
  attachmentsReady,
  sendBlocked,
}: DraftInputProps) => {
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
  const query = menuQuery(command, draft, draft && caret.text === draft ? caret.at : null)
  const menu = dismissed
    ? null
    : composerMenu(query, { commands, files, recentFileIds, conversations, activeConversationId })
  const options = menu?.kind === 'command' ? menu.commands.length : (menu?.options.length ?? 0)
  // A summary can be stopped like a reply, but accepts no new messages.
  const running = phase === 'running' || phase === 'stopping' || phase === 'compacting'
  // While a reply runs, sending queues the message.
  const canSend =
    (phase === 'ready' || phase === 'running') &&
    !sendBlocked &&
    Boolean(value.trim() || attachmentsReady)

  useEffect(() => {
    if (phase === 'switching') setTypedCommand('')
  }, [phase])

  // Read again at each #, so the list holds conversations begun since the last one.
  const mentioningConversation = query?.kind === 'conversation'
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

  const pickMention = (index: number) => {
    if (menu?.kind !== 'mention') return
    const token = menu.tokens[index]
    if (token === undefined) return
    const next = insertMention(draft, caret.at, menu.mention, token)
    onDraftChange(next.text)
    setPendingCaret(next.caret)
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
    if (menu?.kind === 'mention') return pickMention(selected)
    const picked = menu?.commands[selected]
    if (picked && key === 'Enter') runCommand(picked)
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

  return (
    <>
      {menu?.kind === 'command' && (
        <SlashCommandMenu
          id={menuId}
          commands={menu.commands}
          selected={selected}
          onRun={runCommand}
        />
      )}
      {menu?.kind === 'mention' && (
        <MentionMenu
          id={menuId}
          label={menu.label}
          options={menu.options}
          selected={selected}
          onPick={pickMention}
        />
      )}
      <div className={styles.input}>
        <textarea
          ref={inputRef}
          disabled={phase === 'loading' || phase === 'switching'}
          aria-label="Your question"
          placeholder="Ask about what you are reading, @ for files, # for conversations, / for commands"
          aria-controls={menu ? menuId : undefined}
          aria-activedescendant={menu ? commandOptionId(menuId, selected) : undefined}
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
            if (menu && !event.shiftKey && handleMenuKey(event.key)) {
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
    </>
  )
}
