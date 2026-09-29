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

export const projectTitle = (project: Project) => `${project.name} · Gamma Reader`

export const normalizeProjectName = (name: string) => name.trim().replace(/\s+/g, ' ')
