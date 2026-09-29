import { defaultProjectName, legacyDatabaseName, type Project } from '../core/projects'

// The library every test uses unless it opens another project on purpose.
export const testProject: Project = {
  id: 'first',
  name: defaultProjectName,
  databaseName: legacyDatabaseName,
  createdAt: 0,
  lastActiveAt: 0,
}
