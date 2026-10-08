import type { Project } from '../../core/projects'
import type { MemoryEntry } from './entry'
import { MemoryRow } from './memory-row'
import styles from './style.module.scss'

// The notes as the Memory tab lists them: what a search found, or every note under who or what it
// is about, most recently used first.
export const NoteSections = ({
  notes,
  found,
  projects,
  onTag,
}: {
  notes: readonly MemoryEntry[]
  found: readonly MemoryEntry[] | null
  projects: readonly Project[]
  onTag: (tag: string) => void
}) =>
  found ? (
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
              onTag={onTag}
            />
          ))}
        </ul>
      )}
    </section>
  ) : (
    groupEntries(notes, projects).map(group => (
      <section key={group.key} className={styles.group} aria-label={group.title}>
        <h2>{group.title}</h2>
        <ul>
          {group.entries.map(entry => (
            <MemoryRow
              key={entry.id}
              entry={entry}
              source={sourceOf(entry, projects)}
              onTag={onTag}
            />
          ))}
        </ul>
      </section>
    ))
  )

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
