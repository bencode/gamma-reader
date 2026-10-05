import type { CodeLabLanguage } from '@gamma-reader/code-lab'
import * as Popover from '@radix-ui/react-popover'
import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useWorkspaceSourceActions, useWorkspaceStore } from '../../../shell/workspace-context'
import { appendLabCell } from './document-model'
import { useLabDocument } from './document-scope'
import styles from './style.module.scss'

const languages: readonly { language: CodeLabLanguage; label: string }[] = [
  { language: 'scheme', label: 'Scheme' },
  { language: 'clojure', label: 'Clojure' },
  { language: 'python', label: 'Python' },
  { language: 'typescript', label: 'TypeScript' },
]

// Adds an empty cell at the end of the Lab, in the draft as an edit in Source would be, then
// brings it into view with its editor focused, ready for code to be pasted and run.
export const AddCell = ({ fileId }: { fileId: string }) => {
  const store = useWorkspaceStore()
  const actions = useWorkspaceSourceActions()
  const [open, setOpen] = useState(false)
  const [added, setAdded] = useState<string | null>(null)
  const { model } = useLabDocument()

  // The cell appears once the draft is read again, and its editor a moment after.
  useEffect(() => {
    if (!added || !model.cells.some(cell => cell.id === added)) return
    const frame = requestAnimationFrame(() => {
      const cell = document.querySelector<HTMLElement>(`[data-lab-cell="${added}"]`)
      cell?.scrollIntoView({ block: 'center' })
      cell?.querySelector<HTMLElement>('.cm-content')?.focus()
      setAdded(null)
    })
    return () => cancelAnimationFrame(frame)
  }, [added, model])

  const add = (language: CodeLabLanguage) => {
    setOpen(false)
    const draft = store.getState().sourceDrafts[fileId]
    if (!draft) return
    const next = appendLabCell(draft.content, language)
    actions.updateSource(fileId, next.source)
    setAdded(next.id)
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={`icon-button ${styles.addCell}`}
          aria-label="Add a cell"
          title="Add cell"
        >
          <Plus size={16} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="add-menu"
          role="menu"
          align="end"
          sideOffset={4}
          // Focus goes to the new cell's editor, not back to this button.
          onCloseAutoFocus={event => event.preventDefault()}
        >
          {languages.map(({ language, label }) => (
            <button key={language} type="button" role="menuitem" onClick={() => add(language)}>
              {label}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
