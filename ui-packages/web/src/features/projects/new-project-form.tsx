import { ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { normalizeProjectName, type Project, projectPath } from '../../core/projects'
import { createProject } from '../../data/project-store'
import styles from './style.module.scss'

type Phase =
  | { kind: 'editing'; error: string | null }
  | { kind: 'creating' }
  | { kind: 'created'; project: Project }

// The link appears only once the project is saved, so opening it never races the write, and
// following an ordinary link is something no popup blocker stands in the way of.
export const NewProjectForm = ({
  newTab,
  onCreated,
}: {
  newTab: boolean
  onCreated?: (project: Project) => void
}) => {
  const [name, setName] = useState('Untitled project')
  const [phase, setPhase] = useState<Phase>({ kind: 'editing', error: null })
  if (phase.kind === 'created')
    return (
      <a
        className={styles.createdLink}
        href={projectPath(phase.project.id)}
        {...(newTab ? { target: '_blank', rel: 'noopener' } : {})}
        // biome-ignore lint/a11y/noAutofocus: the link replaces the field that had focus.
        autoFocus
      >
        <span className={styles.name}>Open {phase.project.name}</span>
        {newTab && <ExternalLink size={13} aria-hidden="true" />}
      </a>
    )
  return (
    <form
      className={styles.form}
      onSubmit={event => {
        event.preventDefault()
        if (!normalizeProjectName(name) || phase.kind === 'creating') return
        setPhase({ kind: 'creating' })
        createProject(name).then(
          project => {
            setPhase({ kind: 'created', project })
            onCreated?.(project)
          },
          error => {
            console.error('Unable to create project', error)
            setPhase({ kind: 'editing', error: 'The project could not be created. Try again.' })
          },
        )
      }}
    >
      <input
        aria-label="New project name"
        value={name}
        disabled={phase.kind === 'creating'}
        onChange={event => setName(event.target.value)}
        onFocus={event => event.currentTarget.select()}
        // biome-ignore lint/a11y/noAutofocus: the field opens in response to New project.
        autoFocus
      />
      <button
        type="submit"
        className="primary-button"
        disabled={!normalizeProjectName(name) || phase.kind === 'creating'}
      >
        {phase.kind === 'creating' ? 'Creating…' : 'Create'}
      </button>
      {phase.kind === 'editing' && phase.error && (
        <p className={styles.error} role="alert">
          {phase.error}
        </p>
      )}
    </form>
  )
}
