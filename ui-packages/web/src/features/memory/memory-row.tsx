import { useId, useState } from 'react'
import type { MemoryEntry } from './entry'
import { removeMemories, updateMemory } from './store'
import styles from './style.module.scss'

const day = 24 * 60 * 60 * 1000
// A note the assistant has not used in this long is shown faded: still kept, but going quiet.
const quietAfter = 90 * day

const dateOf = (time: number) => new Date(time).toISOString().slice(0, 10)

export const MemoryRow = ({ entry, source }: { entry: MemoryEntry; source: string }) => {
  const coreId = useId()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(entry.text)
  const [core, setCore] = useState(entry.core)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const act = (action: () => Promise<unknown>, failed: string) => {
    setPending(true)
    setFailure(null)
    action().then(
      () => {
        setPending(false)
        setEditing(false)
      },
      cause => {
        console.error(failed, cause)
        setPending(false)
        setFailure(`${failed} Try again.`)
      },
    )
  }
  const quiet = Date.now() - entry.confirmedAt > quietAfter
  return (
    <li className={quiet ? styles.quiet : undefined}>
      {editing ? (
        <form
          className={styles.editor}
          onSubmit={event => {
            event.preventDefault()
            if (!text.trim()) return
            act(
              () =>
                updateMemory(entry.id, {
                  text: text.trim(),
                  core: entry.scope === 'reader' && core,
                }),
              'The note could not be saved.',
            )
          }}
        >
          <textarea
            aria-label="Note"
            value={text}
            disabled={pending}
            onChange={event => setText(event.target.value)}
          />
          {entry.scope === 'reader' && (
            <label htmlFor={coreId}>
              <input
                id={coreId}
                type="checkbox"
                checked={core}
                disabled={pending}
                onChange={event => setCore(event.target.checked)}
              />
              Keep in mind in every conversation
            </label>
          )}
          <div className={styles.rowActions}>
            <button
              type="button"
              className="secondary-button"
              disabled={pending}
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={pending || !text.trim()}>
              Save
            </button>
          </div>
        </form>
      ) : (
        <>
          <span className={styles.text}>
            {entry.text}
            <span className={styles.source}>
              {[
                source,
                entry.core && 'kept in mind in every conversation',
                `last used ${dateOf(entry.confirmedAt)}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
          <button
            type="button"
            className="text-button"
            aria-label={`Edit “${entry.text}”`}
            disabled={pending}
            onClick={() => {
              setText(entry.text)
              setCore(entry.core)
              setEditing(true)
            }}
          >
            Edit
          </button>
          <button
            type="button"
            className="text-button"
            aria-label={`Delete “${entry.text}”`}
            disabled={pending}
            onClick={() => act(() => removeMemories([entry.id]), 'The note could not be deleted.')}
          >
            Delete
          </button>
        </>
      )}
      {failure && (
        <p className={styles.failure} role="alert">
          {failure}
        </p>
      )}
    </li>
  )
}
