import { useEffect, useState } from 'react'
import { BrowserRouter } from 'react-router-dom'
import {
  legacyDatabaseName,
  type Project,
  projectPath,
  projectTitle,
  projectWindowName,
} from '../core/projects'
import {
  clearPendingDeletion,
  deleteProject,
  getProject,
  isPendingDeletion,
  listProjects,
  openSourceProject,
  touchProject,
} from '../data/project-store'
import { openWorkspaceDatabase, setWorkspaceDatabaseName } from '../data/workspace-database'
import { loadProjectSource } from '../features/source/load-source'
import { EmptyWorkbench } from './empty-workbench'
import { Workbench } from './workbench'

type Boot =
  | { kind: 'loading' }
  | { kind: 'deleting'; project: Project; waiting: boolean }
  | { kind: 'waiting'; project: Project }
  | { kind: 'project'; project: Project }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }

class ProjectDeletionError extends Error {}

const projectSegment = /^\/p\/([^/]+)/
const isLegacyPath = (pathname: string) => pathname === '/files' || pathname.startsWith('/files/')

// The address names the project, and the project names the library, so this runs before any
// store is opened. Every other address is rewritten in place to one inside a project; nothing
// has been read yet, so there is no need to reload the page to do it.
const resolveProject = async (): Promise<Project | null> => {
  const { pathname, search, hash } = window.location
  const requested = pathname.match(projectSegment)?.[1]
  if (requested) {
    const project = await touchProject(decodeURIComponent(requested))
    if (project) return project
  }
  // A deployment bound to a source opens its project unless another one was asked for.
  const source = await loadProjectSource()
  if (source) {
    const project = await openSourceProject(source)
    window.history.replaceState(null, '', `${projectPath(project.id)}${search}${hash}`)
    return project
  }
  const projects = await listProjects()
  // Links from before projects existed all point into the library that became the first one.
  const legacy = !requested && isLegacyPath(pathname)
  const target =
    (legacy ? projects.find(project => project.databaseName === legacyDatabaseName) : undefined) ??
    projects[0]
  if (!target) {
    window.history.replaceState(null, '', '/')
    return null
  }
  window.history.replaceState(
    null,
    '',
    `${projectPath(target.id)}${legacy ? pathname : ''}${search}${hash}`,
  )
  return (await touchProject(target.id)) ?? target
}

// The page that asked for a deletion has gone, so nothing here holds the library open; if the
// deletion is blocked, another tab has the project and it finishes once that tab closes.
const deleteRequestedProject = async (onDeleting: (project: Project, waiting: boolean) => void) => {
  const requested = new URLSearchParams(window.location.search).get('delete')
  if (!requested) return
  if (isPendingDeletion(requested)) {
    const project = await getProject(requested)
    if (project) {
      onDeleting(project, false)
      try {
        await deleteProject(project, () => onDeleting(project, true))
      } catch (error) {
        throw new ProjectDeletionError(`${project.name} could not be deleted.`, { cause: error })
      }
    }
  }
  clearPendingDeletion()
  window.history.replaceState(null, '', '/')
}

export const ProjectRoot = () => {
  const [boot, setBoot] = useState<Boot>({ kind: 'loading' })
  useEffect(() => {
    let current = true
    const show = (next: Boot) => {
      if (current) setBoot(next)
    }
    deleteRequestedProject((project, waiting) => show({ kind: 'deleting', project, waiting }))
      .then(resolveProject)
      .then(
        project => {
          if (!current) return
          if (!project) {
            setBoot({ kind: 'empty' })
            return
          }
          setWorkspaceDatabaseName(project.databaseName)
          document.title = projectTitle(project)
          window.name = projectWindowName(project.id)
          // Opening here, before anything reads, lets an upgrade held up by an older tab say so.
          // A failure is left to the readers below, which already explain it and offer a retry.
          void openWorkspaceDatabase(() => show({ kind: 'waiting', project }))
            .catch(error => {
              console.error('Unable to open the project library', error)
            })
            .then(() => show({ kind: 'project', project }))
        },
        error => {
          console.error('Unable to open projects', error)
          show({
            kind: 'error',
            message:
              error instanceof ProjectDeletionError
                ? error.message
                : 'Projects could not be opened in this browser.',
          })
        },
      )
    return () => {
      current = false
    }
  }, [])
  if (boot.kind === 'loading') return null
  if (boot.kind === 'deleting' || boot.kind === 'waiting')
    return (
      <p className="resource-state" role="status">
        {boot.kind === 'waiting' || boot.waiting
          ? `Waiting for other tabs that have ${boot.project.name} open to close.`
          : `Deleting ${boot.project.name}…`}
      </p>
    )
  if (boot.kind === 'empty') return <EmptyWorkbench />
  if (boot.kind === 'error')
    return (
      <div className="resource-state error-state" role="alert">
        <p>{boot.message}</p>
        <a href="/">Return to your projects</a>
      </div>
    )
  return (
    <BrowserRouter basename={projectPath(boot.project.id)}>
      <Workbench project={boot.project} />
    </BrowserRouter>
  )
}
