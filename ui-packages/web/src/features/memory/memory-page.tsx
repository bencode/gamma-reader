import { useEffect, useId, useState } from 'react'
import type { Project } from '../../core/projects'
import { listProjects } from '../../data/project-store'
import type { MemoryEntry } from './entry'
import { MemoryRow } from './memory-row'
import { searchMemories } from './search'
import { refreshMemoryEnabled, setMemoryEnabled, useMemoryEnabled } from './settings'
import { listMemories, subscribeMemories } from './store'
import styles from './style.module.scss'

type Group = { key: string; title: string; entries: MemoryEntry[] }

const projectName = (projects: readonly Project[], key: string) =>
  projects.find(project => project.databaseName === key)?.name ?? 'Deleted project'

const groupTitle = (entry: MemoryEntry, projects: readonly Project[]) =>
  entry.scope === 'reader' ? 'About you' : projectName(projects, entry.projectKey)

// A note about the reader says where it was saved; one about a project is listed under it.
const sourceOf = (entry: MemoryEntry, projects: readonly Project[]) =>
  entry.scope === 'reader' ? `Saved in ${projectName(projects, entry.projectKey)}` : ''

const recentFirst = (a: MemoryEntry, b: MemoryEntry) => b.confirmedAt - a.confirmedAt

const groupEntries = (entries: readonly MemoryEntry[], projects: readonly Project[]): Group[] => {
  const recent = entries.toSorted(recentFirst)
  const keys = [
    'reader',
    ...new Set(recent.filter(entry => entry.scope === 'project').map(entry => entry.projectKey)),
  ]
  return keys
    .map(key => ({
      key,
      title: key === 'reader' ? 'About you' : projectName(projects, key),
      entries: recent.filter(entry =>
        key === 'reader'
          ? entry.scope === 'reader'
          : entry.scope === 'project' && entry.projectKey === key,
      ),
    }))
    .filter(group => group.entries.length > 0)
}

const searchLimit = 50

// Every note the assistant keeps, across projects, to search, correct and delete. Searching here
// finds what recall_memory would, so the reader can see how well a note is found.
export const MemoryPage = ({ active }: { active: boolean }) => {
  const enabled = useMemoryEnabled()
  const switchId = useId()
  const [entries, setEntries] = useState<MemoryEntry[] | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [failure, setFailure] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<MemoryEntry[] | null>(null)

  useEffect(() => {
    if (!active) return
    refreshMemoryEnabled()
    let current = true
    const load = () =>
      Promise.all([listMemories(), listProjects()]).then(
        ([saved, known]) => {
          if (!current) return
          setEntries(saved)
          setProjects(known)
          setFailure(null)
        },
        cause => {
          console.error('Unable to read memory', cause)
          if (current) setFailure('Memory could not be read in this browser.')
        },
      )
    void load()
    const unsubscribe = subscribeMemories(() => void load())
    return () => {
      current = false
      unsubscribe()
    }
  }, [active])

  useEffect(() => {
    const words = query.trim()
    if (!entries || !words) {
      setFound(null)
      return
    }
    let current = true
    searchMemories(entries, [words], searchLimit).then(
      hits => {
        if (current) setFound(hits.filter(hit => hit.score > 0).map(hit => hit.entry))
      },
      cause => {
        console.error('Unable to search memory', cause)
        if (current) setFailure('Memory could not be searched.')
      },
    )
    return () => {
      current = false
    }
  }, [entries, query])

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1>Memory</h1>
          {entries && entries.length > 0 && (
            <p className={styles.note}>
              {entries.length === 1 ? '1 note' : `${entries.length} notes`}, most recently used
              first. Notes the assistant has not used for three months are shown faded.
            </p>
          )}
        </div>
        <input
          type="search"
          aria-label="Search memory"
          placeholder="Search memory"
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
      </header>
      <div>
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
          One switch for every project in this browser. Say “remember…” in a conversation to keep a
          note, or “forget…” to let one go. What is about you is recalled in every project; what is
          about a project stays with it. Notes go to the model with your questions.
        </p>
      </div>
      {failure && <p role="alert">{failure}</p>}
      {entries?.length === 0 && (
        <p className={styles.note}>
          Nothing remembered yet. With memory on, ask the assistant to remember something.
        </p>
      )}
      {found ? (
        <section className={styles.group} aria-label="Search results">
          {found.length === 0 ? (
            <p className={styles.note}>No note matches.</p>
          ) : (
            <ul>
              {found.map(entry => (
                <MemoryRow
                  key={entry.id}
                  entry={entry}
                  source={[groupTitle(entry, projects), sourceOf(entry, projects)]
                    .filter(Boolean)
                    .join(' · ')}
                />
              ))}
            </ul>
          )}
        </section>
      ) : (
        entries &&
        groupEntries(entries, projects).map(group => (
          <section key={group.key} className={styles.group} aria-label={group.title}>
            <h2>{group.title}</h2>
            <ul>
              {group.entries.map(entry => (
                <MemoryRow key={entry.id} entry={entry} source={sourceOf(entry, projects)} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
