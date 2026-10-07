import type { MemoryEntry } from './entry'
import { restoreMerged } from './store'
import styles from './style.module.scss'

// Notes tidying merged into others, kept so a merge that went wrong can be undone.
export const MergedNotes = ({ entries }: { entries: readonly MemoryEntry[] }) => {
  const merged = entries.filter(entry => entry.mergedInto !== undefined)
  if (!merged.length) return null
  const textOf = (id: string | undefined) => entries.find(entry => entry.id === id)?.text
  return (
    <details className={styles.merged}>
      <summary>
        Merged notes ({merged.length}) — tidying folded these into others; restore one to use it
        again
      </summary>
      <ul>
        {merged.map(entry => (
          <li key={entry.id}>
            <span className={styles.text}>
              {entry.text}
              <span className={styles.source}>
                Merged into: {textOf(entry.mergedInto) ?? 'a note since deleted'}
              </span>
            </span>
            <button
              type="button"
              className="text-button"
              aria-label={`Restore “${entry.text}”`}
              onClick={() =>
                restoreMerged(entry.id).catch(cause => {
                  console.error('Unable to restore a merged note', cause)
                })
              }
            >
              Restore
            </button>
          </li>
        ))}
      </ul>
    </details>
  )
}
