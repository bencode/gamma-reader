import { workspaceStorageBases, workspaceStorageKey } from '../../data/workspace-database'

export type FileView = 'files' | 'recent' | 'starred'

export type FileNavigationState = {
  view: FileView
  recent: { fileId: string; openedAt: number }[]
  starred: string[]
}

const defaults = (): FileNavigationState => ({ view: 'files', recent: [], starred: [] })
const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const isRecent = (value: unknown): value is FileNavigationState['recent'][number] =>
  typeof value === 'object' &&
  value !== null &&
  'fileId' in value &&
  isId(value.fileId) &&
  'openedAt' in value &&
  typeof value.openedAt === 'number' &&
  Number.isFinite(new Date(value.openedAt).getTime()) &&
  value.openedAt >= 0

export const readFileNavigation = (): FileNavigationState => {
  try {
    const raw = localStorage.getItem(workspaceStorageKey(workspaceStorageBases.fileNavigation))
    if (!raw) return defaults()
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) throw new Error('Invalid file navigation')
    const view = 'view' in value ? value.view : null
    const recent = 'recent' in value && Array.isArray(value.recent) ? value.recent : []
    const starred = 'starred' in value && Array.isArray(value.starred) ? value.starred : []
    const validRecent = recent.filter(isRecent)
    const validStarred = starred.filter(isId)
    const validView = view === 'files' || view === 'recent' || view === 'starred'
    if (
      !validView ||
      !('recent' in value && Array.isArray(value.recent)) ||
      !('starred' in value && Array.isArray(value.starred)) ||
      validRecent.length !== recent.length ||
      validStarred.length !== starred.length
    )
      console.error('Invalid fields in stored file navigation')
    return {
      view: validView ? view : 'files',
      recent: validRecent
        .filter(
          (item, index, items) => items.findIndex(other => other.fileId === item.fileId) === index,
        )
        .slice(0, 50),
      starred: [...new Set(validStarred)],
    }
  } catch (error) {
    console.error('Unable to read file navigation', error)
    return defaults()
  }
}

export const writeFileNavigation = (state: FileNavigationState): void => {
  try {
    localStorage.setItem(
      workspaceStorageKey(workspaceStorageBases.fileNavigation),
      JSON.stringify(state),
    )
  } catch (error) {
    console.error('Unable to save file navigation', error)
  }
}
