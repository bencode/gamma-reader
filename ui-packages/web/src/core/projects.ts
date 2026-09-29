export type Project = {
  id: string
  name: string
  databaseName: string
  createdAt: number
  lastActiveAt: number
}

// The library that existed before projects keeps its name, so upgrading moves no data.
export const legacyDatabaseName = 'gamma-reader-files'
export const defaultProjectName = 'My reading'

export const projectPath = (projectId: string) => `/p/${projectId}`

export const projectDeletionPath = (projectId: string) =>
  `/?delete=${encodeURIComponent(projectId)}`

// A tab names itself after its project, so a link to the project can find it again.
export const projectWindowName = (projectId: string) => `gamma-reader-project-${projectId}`

export const projectTitle = (project: Project) => `${project.name} · Gamma Reader`

export const normalizeProjectName = (name: string) => name.trim().replace(/\s+/g, ' ')
