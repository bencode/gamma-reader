import { type DBSchema, type IDBPDatabase, openDB } from 'idb'
import { nanoid } from 'nanoid'
import {
  defaultProjectName,
  legacyDatabaseName,
  normalizeProjectName,
  type Project,
  type ProjectSource,
  sourceProjectId,
} from '../core/projects'
import {
  deleteIndexedDatabase,
  workspaceStorageBases,
  workspaceStorageKey,
} from './workspace-database'

type ProjectDatabase = DBSchema & {
  projects: { key: string; value: Project; indexes: { 'by-last-active': number } }
}

const registryName = 'gamma-reader-projects'
let registryPromise: Promise<IDBPDatabase<ProjectDatabase>> | undefined

const newProject = (name: string, databaseName?: string, id = nanoid(10)): Project => {
  const now = Date.now()
  return {
    id,
    name: normalizeProjectName(name),
    databaseName: databaseName ?? `gamma-reader-project-${id}`,
    createdAt: now,
    lastActiveAt: now,
  }
}

const openRegistry = () => {
  registryPromise ??= openDB<ProjectDatabase>(registryName, 1, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        const projects = database.createObjectStore('projects', { keyPath: 'id' })
        projects.createIndex('by-last-active', 'lastActiveAt')
        // Whatever the reader kept before projects existed becomes their first project. A failed
        // write aborts the upgrade, which rejects the open below.
        projects.put(newProject(defaultProjectName, legacyDatabaseName))
      }
    },
  }).catch(error => {
    registryPromise = undefined
    throw error
  })
  return registryPromise
}

export const listProjects = async () => {
  const database = await openRegistry()
  return (await database.getAllFromIndex('projects', 'by-last-active')).reverse()
}

export const getProject = async (id: string) => {
  const database = await openRegistry()
  return (await database.get('projects', id)) ?? null
}

export const createProject = async (name: string) => {
  const project = newProject(name)
  const database = await openRegistry()
  await database.add('projects', project)
  return project
}

// The deployment's source decides the project, so a visit always lands in the same library, and
// the address it records follows the deployment if that changes.
export const openSourceProject = async (source: ProjectSource) => {
  const database = await openRegistry()
  const id = sourceProjectId(source)
  const existing = await database.get('projects', id)
  const project = {
    ...(existing ?? newProject(source.name, undefined, id)),
    source,
    lastActiveAt: Date.now(),
  }
  await database.put('projects', project)
  return project
}

export const renameProject = async (id: string, name: string) => {
  const database = await openRegistry()
  const project = await database.get('projects', id)
  if (!project) throw new Error('Project is unavailable.')
  const renamed = { ...project, name: normalizeProjectName(name) }
  await database.put('projects', renamed)
  return renamed
}

export const touchProject = async (id: string) => {
  const database = await openRegistry()
  const project = await database.get('projects', id)
  if (!project) return null
  const touched = { ...project, lastActiveAt: Math.max(Date.now(), project.lastActiveAt + 1) }
  await database.put('projects', touched)
  return touched
}

// A project is deleted by the page that opens after the request, before it opens any library, so
// only another tab can hold the library open. The project leaves the registry first, so nothing
// opens it while its library waits for those tabs: an open would queue behind the deletion and
// never finish. Deleting the library is cleanup; if it never completes, an unlisted library is
// left taking space and nothing else.
export const deleteProject = async (project: Project, onBlocked: () => void) => {
  const database = await openRegistry()
  await database.delete('projects', project.id)
  Object.values(workspaceStorageBases).forEach(base => {
    localStorage.removeItem(workspaceStorageKey(base, project.databaseName))
  })
  await deleteIndexedDatabase(project.databaseName, onBlocked)
}

const pendingDeletionKey = 'gamma-reader.pending-deletion'

// The deletion address names the project, and this tab's session storage vouches that the reader
// asked for it here: no link can set the one, and a cancelled navigation never reaches the other.
export const schedulePendingDeletion = (projectId: string) =>
  sessionStorage.setItem(pendingDeletionKey, projectId)

export const isPendingDeletion = (projectId: string) =>
  sessionStorage.getItem(pendingDeletionKey) === projectId

export const clearPendingDeletion = () => sessionStorage.removeItem(pendingDeletionKey)

export const deleteProjectStore = async () => {
  const database = await registryPromise
  database?.close()
  registryPromise = undefined
  await deleteIndexedDatabase(registryName)
}
