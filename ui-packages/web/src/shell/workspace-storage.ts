import { samples } from '../core/samples'

type SavedWorkspace = { tabs: string[]; lastActiveId: string | null }

const storageKey = 'gamma-reader.workspace'
const defaults: SavedWorkspace = { tabs: ['getting-started'], lastActiveId: 'getting-started' }
const isDocumentId = (value: unknown): value is string =>
  samples.some(document => document.id === value)

export const readWorkspace = (): SavedWorkspace => {
  try {
    const raw = localStorage.getItem(storageKey)
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
    return { tabs: [...new Set(value.tabs)], lastActiveId: value.lastActiveId }
  } catch (error) {
    console.error('Unable to restore workspace', error)
    return defaults
  }
}

export const writeWorkspace = (workspace: SavedWorkspace) => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(workspace))
  } catch (error) {
    console.error('Unable to save workspace', error)
  }
}
