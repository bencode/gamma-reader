import { isReadingPosition, type ReadingPosition } from '../core/reading-position'
import { workspaceStorageBases, workspaceStorageKey } from '../data/workspace-database'

export type ReadingPositions = Record<string, ReadingPosition>

type SavedWorkspace = {
  tabs: string[]
  lastActiveId: string | null
  positions: ReadingPositions
}

const storageKey = workspaceStorageBases.workspace
const defaults: SavedWorkspace = { tabs: [], lastActiveId: null, positions: {} }
const isDocumentId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0

// Positions arrived after tabs, so an absent or partly unreadable set costs only those entries.
const openPositions = (value: unknown, tabs: readonly string[]): ReadingPositions =>
  typeof value === 'object' && value !== null
    ? Object.fromEntries(
        Object.entries(value).filter(
          ([id, position]) => tabs.includes(id) && isReadingPosition(position),
        ),
      )
    : {}

export const readWorkspace = (): SavedWorkspace => {
  try {
    const raw = localStorage.getItem(workspaceStorageKey(storageKey))
    if (raw === null) return defaults
    const value: unknown = JSON.parse(raw)
    if (
      typeof value !== 'object' ||
      value === null ||
      !('tabs' in value) ||
      !Array.isArray(value.tabs) ||
      !value.tabs.every(isDocumentId) ||
      !('lastActiveId' in value) ||
      (value.lastActiveId !== null &&
        (!isDocumentId(value.lastActiveId) || !value.tabs.includes(value.lastActiveId)))
    )
      throw new Error('Invalid saved workspace')
    const tabs = [...new Set(value.tabs)]
    return {
      tabs,
      lastActiveId: value.lastActiveId,
      positions: openPositions('positions' in value ? value.positions : undefined, tabs),
    }
  } catch (error) {
    console.error('Unable to restore workspace', error)
    return defaults
  }
}

// A position is kept only while its document is open, so closed and removed files age out.
export const writeWorkspace = ({ tabs, lastActiveId, positions }: SavedWorkspace) => {
  try {
    localStorage.setItem(
      workspaceStorageKey(storageKey),
      JSON.stringify({ tabs, lastActiveId, positions: openPositions(positions, tabs) }),
    )
  } catch (error) {
    console.error('Unable to save workspace', error)
  }
}
