import { useEffect, useState } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { legacyDatabaseName, type Project, projectPath, projectTitle } from '../core/projects'
import { listProjects, touchProject } from '../data/project-store'
import { setWorkspaceDatabaseName } from '../data/workspace-database'
import { EmptyWorkbench } from './empty-workbench'
import { Workbench } from './workbench'

type Boot =
  | { kind: 'loading' }
  | { kind: 'project'; project: Project }
  | { kind: 'empty' }
  | { kind: 'error' }

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

export const ProjectRoot = () => {
  const [boot, setBoot] = useState<Boot>({ kind: 'loading' })
  useEffect(() => {
    let current = true
    resolveProject().then(
      project => {
        if (!current) return
        if (!project) {
          setBoot({ kind: 'empty' })
          return
        }
        setWorkspaceDatabaseName(project.databaseName)
        document.title = projectTitle(project)
        setBoot({ kind: 'project', project })
      },
      error => {
        console.error('Unable to open projects', error)
        if (current) setBoot({ kind: 'error' })
      },
    )
    return () => {
      current = false
    }
  }, [])
  if (boot.kind === 'loading') return null
  if (boot.kind === 'empty') return <EmptyWorkbench />
  if (boot.kind === 'error')
    return (
      <p className="resource-state error-state" role="alert">
        Projects could not be opened in this browser.
      </p>
    )
  return (
    <BrowserRouter basename={projectPath(boot.project.id)}>
      <Workbench project={boot.project} />
    </BrowserRouter>
  )
}
