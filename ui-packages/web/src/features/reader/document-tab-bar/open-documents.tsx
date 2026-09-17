import * as Popover from '@radix-ui/react-popover'
import { Check, ChevronDown, Search } from 'lucide-react'
import { useRef, useState } from 'react'
import type { DocumentTabItem } from './index'
import styles from './style.module.scss'

type OpenDocumentsProps = {
  items: readonly DocumentTabItem[]
  activeId: string | null
  onSelect: (id: string) => void
}

export const OpenDocuments = ({ items, activeId, onSelect }: OpenDocumentsProps) => {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = useRef(false)
  const matches = items.filter(item => item.name.toLowerCase().includes(query.trim().toLowerCase()))
  return (
    <Popover.Root
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (next) {
          setQuery('')
          selected.current = false
        }
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          className={`${styles.listTrigger} icon-button`}
          aria-label="Show open documents"
          title="Show open documents"
          disabled={!items.length}
        >
          <ChevronDown size={16} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={styles.popover}
          align="end"
          sideOffset={5}
          collisionPadding={8}
          aria-label="Open documents"
          onCloseAutoFocus={event => {
            if (selected.current) event.preventDefault()
          }}
        >
          <label className={styles.search}>
            <Search size={14} aria-hidden="true" />
            <input
              aria-label="Find an open document"
              placeholder="Find an open document…"
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
          </label>
          <ul className={styles.results} aria-label="Open document results">
            {matches.map(item => (
              <li key={item.id}>
                <button
                  type="button"
                  className={styles.result}
                  aria-current={item.id === activeId ? 'page' : undefined}
                  title={item.name}
                  onClick={() => {
                    selected.current = true
                    setOpen(false)
                    onSelect(item.id)
                  }}
                >
                  <span className={styles.check}>
                    {item.id === activeId && <Check size={14} />}
                  </span>
                  <span className={styles.name}>{item.name}</span>
                  {item.dirty && (
                    <span className="source-dirty" role="img" aria-label="Unsaved changes">
                      ●
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          {!matches.length && <p className={styles.empty}>No matching documents</p>}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
