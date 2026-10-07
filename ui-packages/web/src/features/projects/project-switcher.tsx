import * as Popover from '@radix-ui/react-popover'
import { BookOpen, Check, ChevronDown, ExternalLink } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { normalizeProjectName, type Project, projectTitle } from '../../core/projects'
import { listProjects, renameProject } from '../../data/project-store'
import { MemoryDialog } from '../memory'
import type { FileExportController } from '../resources/use-file-export'
import { DeleteProjectDialog } from './delete-project-dialog'
import { NewProjectForm } from './new-project-form'
import { ProjectLink } from './project-link'
import { ProjectStorageDialog } from './project-storage-dialog'
import styles from './style.module.scss'

type Mode = 'list' | 'create' | 'rename'

const RenameForm = ({
  project,
  onRenamed,
}: {
  project: Project
  onRenamed: (project: Project) => void
}) => {
  const [name, setName] = useState(project.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => inputRef.current?.focus(), [])
  return (
    <form
      className={styles.form}
      onSubmit={event => {
        event.preventDefault()
        if (!normalizeProjectName(name) || saving) return
        setSaving(true)
        renameProject(project.id, name).then(onRenamed, cause => {
          console.error('Unable to rename project', cause)
          setError('The project could not be renamed. Try again.')
          setSaving(false)
        })
      }}
    >
      <input
        ref={inputRef}
        aria-label="Project name"
        value={name}
        disabled={saving}
        onChange={event => setName(event.target.value)}
        onFocus={event => event.currentTarget.select()}
      />
      <button
        type="submit"
        className="primary-button"
        disabled={!normalizeProjectName(name) || saving}
      >
        Rename
      </button>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  )
}

type ProjectSwitcherProps =
  | {
      project: Project
      fileCount: number
      exporter: FileExportController
      onOpenMemory: () => void
    }
  | { project: null }

export const ProjectSwitcher = (props: ProjectSwitcherProps) => {
  const [current, setCurrent] = useState(props.project)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('list')
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showingStorage, setShowingStorage] = useState(false)
  const [showingMemory, setShowingMemory] = useState(false)
  const others = (projects ?? []).filter(project => project.id !== current?.id)

  const loadProjects = () => {
    setListError(null)
    listProjects().then(setProjects, cause => {
      console.error('Unable to list projects', cause)
      setListError('Projects could not be loaded.')
    })
  }

  return (
    <>
      <Popover.Root
        open={open}
        onOpenChange={next => {
          setOpen(next)
          setMode('list')
          if (next) loadProjects()
        }}
      >
        <Popover.Trigger asChild>
          <button type="button" className={`brand ${styles.trigger}`} title="Gamma Reader projects">
            <BookOpen size={18} strokeWidth={1.8} aria-hidden="true" />
            <span className={styles.name}>{current?.name ?? 'No project'}</span>
            <ChevronDown size={14} className={styles.chevron} aria-hidden="true" />
          </button>
        </Popover.Trigger>
        {/* Kept out of a portal: the Files panel can itself be a modal dialog, and content
            outside the top layer would be inert behind it. */}
        <Popover.Content
          className={styles.popover}
          align="start"
          sideOffset={4}
          collisionPadding={8}
          aria-label="Projects"
          onEscapeKeyDown={event => {
            if (mode === 'list') return
            event.preventDefault()
            setMode('list')
          }}
        >
          <ul className={styles.projects} aria-label="Projects">
            {current && (
              <li>
                <span className={styles.project} aria-current="page">
                  <Check size={14} className={styles.check} aria-hidden="true" />
                  <span className={styles.name}>{current.name}</span>
                </span>
              </li>
            )}
            {others.map(project => (
              <li key={project.id}>
                <ProjectLink
                  className={styles.project}
                  projectId={project.id}
                  title={`Open ${project.name} in its own tab`}
                >
                  <span className={styles.check} />
                  <span className={styles.name}>{project.name}</span>
                  <ExternalLink size={13} aria-hidden="true" />
                </ProjectLink>
              </li>
            ))}
          </ul>
          {listError && (
            <p className={styles.error} role="alert">
              {listError}
            </p>
          )}
          <div className={styles.separator} />
          {mode === 'create' ? (
            <NewProjectForm
              newTab
              onCreated={created =>
                setProjects(existing => (existing ? [created, ...existing] : [created]))
              }
            />
          ) : mode === 'rename' && current ? (
            <RenameForm
              project={current}
              onRenamed={renamed => {
                setCurrent(renamed)
                document.title = projectTitle(renamed)
                setMode('list')
              }}
            />
          ) : (
            <div className={styles.actions}>
              <button type="button" onClick={() => setMode('create')}>
                New project…
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  setShowingMemory(true)
                }}
              >
                Memory…
              </button>
              {current && (
                <>
                  <div className={styles.separator} />
                  <button type="button" onClick={() => setMode('rename')}>
                    Rename project…
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      setShowingStorage(true)
                    }}
                  >
                    View storage
                  </button>
                  <div className={styles.separator} />
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      setDeleting(true)
                    }}
                  >
                    Delete project…
                  </button>
                </>
              )}
            </div>
          )}
        </Popover.Content>
      </Popover.Root>
      {showingMemory && (
        <MemoryDialog
          onClose={() => setShowingMemory(false)}
          onOpenMemory={props.project ? props.onOpenMemory : undefined}
        />
      )}
      {showingStorage && current && (
        <ProjectStorageDialog project={current} onClose={() => setShowingStorage(false)} />
      )}
      {deleting && props.project && current && (
        <DeleteProjectDialog
          project={current}
          fileCount={props.fileCount}
          exporter={props.exporter}
          onCancel={() => setDeleting(false)}
        />
      )}
    </>
  )
}
