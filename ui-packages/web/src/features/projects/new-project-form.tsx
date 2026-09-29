import { ExternalLink } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { normalizeProjectName, type Project, projectPath } from '../../core/projects'
import { createProject } from '../../data/project-store'
import { ProjectLink } from './project-link'
import styles from './style.module.scss'

type Phase =
  | { kind: 'editing'; error: string | null }
  | { kind: 'creating' }
  | { kind: 'created'; project: Project }

// The link takes the place of the field that had focus, so focus follows it there.
const CreatedLink = ({ project, newTab }: { project: Project; newTab: boolean }) => {
  const ref = useRef<HTMLAnchorElement>(null)
  useEffect(() => ref.current?.focus(), [])
  const label = <span className={styles.name}>Open {project.name}</span>
  return newTab ? (
    <ProjectLink ref={ref} className={styles.createdLink} projectId={project.id}>
      {label}
      <ExternalLink size={13} aria-hidden="true" />
    </ProjectLink>
  ) : (
    <a ref={ref} className={styles.createdLink} href={projectPath(project.id)}>
      {label}
    </a>
  )
}

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
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => inputRef.current?.focus(), [])
  if (phase.kind === 'created') return <CreatedLink project={phase.project} newTab={newTab} />
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
        ref={inputRef}
        aria-label="New project name"
        value={name}
        disabled={phase.kind === 'creating'}
        onChange={event => setName(event.target.value)}
        onFocus={event => event.currentTarget.select()}
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
