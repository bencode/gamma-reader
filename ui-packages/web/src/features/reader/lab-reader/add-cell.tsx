import type { CodeLabLanguage } from '@gamma-reader/code-lab'
import * as Popover from '@radix-ui/react-popover'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useLabDocument } from './document-scope'
import styles from './style.module.scss'

const languages: readonly { language: CodeLabLanguage; label: string }[] = [
  { language: 'scheme', label: 'Scheme' },
  { language: 'clojure', label: 'Clojure' },
  { language: 'python', label: 'Python' },
  { language: 'typescript', label: 'TypeScript' },
]

// Adds an empty cell at the end of the Lab, which the Lab then brings into view, ready for code.
export const AddCell = () => {
  const { appendCell } = useLabDocument()
  const [open, setOpen] = useState(false)
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
            <button
              key={language}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                appendCell(language)
              }}
            >
              {label}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
