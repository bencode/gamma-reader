import { useEffect, useRef } from 'react'
import type { MarkdownHeading } from './heading-model'
import styles from './style.module.scss'

export const MarkdownOutline = ({
  headings,
  activeId,
  onNavigate,
  onClose,
}: {
  headings: readonly MarkdownHeading[]
  activeId: string | null
  onNavigate: (id: string) => void
  onClose: () => void
}) => {
  const firstRef = useRef<HTMLButtonElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)
  const minimumLevel = Math.min(...headings.map(heading => heading.level))

  useEffect(() => {
    ;(activeRef.current ?? firstRef.current)?.focus()
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', close, true)
    return () => document.removeEventListener('keydown', close, true)
  }, [onClose])

  useEffect(() => {
    if (activeId) activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  return (
    <div className={styles.outlineLayer}>
      <button
        type="button"
        className={styles.outlineBackdrop}
        aria-label="Close Markdown contents"
        onClick={onClose}
      />
      <aside className={styles.outlinePanel} aria-label="Markdown contents">
        <ul>
          {headings.map((heading, index) => {
            const active = heading.id === activeId
            return (
              <li key={heading.id} className={active ? styles.activeOutlineItem : undefined}>
                <button
                  ref={active ? activeRef : index === 0 ? firstRef : undefined}
                  type="button"
                  className={styles.outlineItem}
                  aria-current={active ? 'location' : undefined}
                  title={heading.title}
                  style={{ paddingInlineStart: 10 + (heading.level - minimumLevel) * 14 }}
                  onClick={() => onNavigate(heading.id)}
                >
                  <span>{heading.title}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </aside>
    </div>
  )
}
