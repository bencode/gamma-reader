import { useEffect, useId, useState } from 'react'
import { ConfirmationDialog } from '../../components/confirmation-dialog'
import type { Project } from '../../core/projects'
import { listProjects } from '../../data/project-store'
import type { MemoryEntry } from './entry'
import { refreshMemoryEnabled, setMemoryEnabled, useMemoryEnabled } from './settings'
import { listMemories, removeMemory } from './store'
import styles from './style.module.scss'

type Group = { key: string; title: string; entries: MemoryEntry[] }

const projectName = (projects: readonly Project[], key: string) =>
  projects.find(project => project.databaseName === key)?.name ?? 'Deleted project'

const groupEntries = (entries: readonly MemoryEntry[], projects: readonly Project[]): Group[] => {
  const newest = entries.toSorted((a, b) => b.createdAt - a.createdAt)
  const projectKeys = [
    ...new Set(newest.filter(entry => entry.scope === 'project').map(entry => entry.projectKey)),
  ]
  return [
    {
      key: 'reader',
      title: 'About you',
      entries: newest.filter(entry => entry.scope === 'reader'),
    },
    ...projectKeys.map(key => ({
      key,
      title: projectName(projects, key),
      entries: newest.filter(entry => entry.scope === 'project' && entry.projectKey === key),
    })),
  ].filter(group => group.entries.length > 0)
}

export const MemoryDialog = ({ onClose }: { onClose: () => void }) => {
  const enabled = useMemoryEnabled()
  const switchId = useId()
  const [entries, setEntries] = useState<MemoryEntry[] | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [failure, setFailure] = useState<string | null>(null)
  useEffect(() => {
    refreshMemoryEnabled()
    let current = true
    Promise.all([listMemories(), listProjects()]).then(
      ([saved, known]) => {
        if (!current) return
        setEntries(saved)
        setProjects(known)
      },
      cause => {
        console.error('Unable to read memory', cause)
        if (current) setFailure('Memory could not be read in this browser.')
      },
    )
    return () => {
      current = false
    }
  }, [])
  const remove = (id: string) => {
    setFailure(null)
    removeMemory(id).then(
      () => setEntries(current => current?.filter(entry => entry.id !== id) ?? null),
      cause => {
        console.error('Unable to delete a memory', cause)
        setFailure('That memory could not be deleted. Try again.')
      },
    )
  }
  const groups = entries ? groupEntries(entries, projects) : []
  return (
    <ConfirmationDialog label="Memory" onCancel={onClose} className={styles.shell}>
      <div className={styles.dialog}>
        <header>
          <h2>Memory</h2>
          <label className={styles.switch} htmlFor={switchId}>
            <input
              id={switchId}
              type="checkbox"
              checked={enabled}
              onChange={event => setMemoryEnabled(event.target.checked)}
            />
            Let the assistant remember what you ask it to
          </label>
          <p className={styles.note}>
            Say “remember…” in any conversation. What is about you is recalled in every project;
            what is about a project stays with it. Remembered notes go to the model with your
            questions, and each one adds a little to what a conversation uses.
          </p>
        </header>
        {failure && <p role="alert">{failure}</p>}
        {entries && groups.length === 0 && <p className={styles.note}>Nothing remembered yet.</p>}
        {groups.map(group => (
          <section key={group.key} className={styles.group} aria-label={group.title}>
            <h3>{group.title}</h3>
            <ul>
              {group.entries.map(entry => (
                <li key={entry.id}>
                  <span className={styles.text}>
                    {entry.text}
                    {entry.scope === 'reader' && (
                      <span className={styles.source}>
                        Saved in {projectName(projects, entry.projectKey)}
                        {entry.core && ' · kept in mind in every conversation'}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="text-button"
                    aria-label={`Delete “${entry.text}”`}
                    onClick={() => remove(entry.id)}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="dialog-actions">
        <button type="button" className="secondary-button" onClick={onClose}>
          Close
        </button>
      </div>
    </ConfirmationDialog>
  )
}
