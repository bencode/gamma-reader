// A remote source the project's library is kept in step with, named by the deployment. A
// writable one also takes the library's changes back, and its id names the folder it serves.
export type ProjectSource = { name: string; url: string; writable?: boolean; id?: string }

export type Project = {
  id: string
  name: string
  databaseName: string
  createdAt: number
  lastActiveAt: number
  source?: ProjectSource
}

// The library that existed before projects keeps its name, so upgrading moves no data.
export const legacyDatabaseName = 'gamma-reader-files'
export const defaultProjectName = 'My reading'

export const projectPath = (projectId: string) => `/p/${projectId}`

// One project per source, found again by its name on every visit.
export const sourceProjectId = (source: ProjectSource) =>
  `source-${encodeURIComponent(source.name.toLowerCase())}`

export const projectDeletionPath = (projectId: string) =>
  `/?delete=${encodeURIComponent(projectId)}`

// A tab names itself after its project, so a link to the project can find it again.
export const projectWindowName = (projectId: string) => `gamma-reader-project-${projectId}`

export const projectTitle = (project: Project) => `${project.name} · Gamma Reader`

export const normalizeProjectName = (name: string) => name.trim().replace(/\s+/g, ' ')
