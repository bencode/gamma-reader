import { listStoredFiles } from './file-store'
import { openWorkspaceDatabase } from './workspace-database'

export type StoreSummary = { name: string; records: number }

export type BrowserStorage = { usage: number; quota: number; persisted: boolean }

export type StorageSummary = {
  databaseName: string
  stores: readonly StoreSummary[]
  /** The same sum the library limit checks: every stored file, attachments included. */
  fileBytes: number
  browser: BrowserStorage | null
}

// Origin-wide, so it covers every project in this browser, not just the open one.
const readBrowserStorage = async (): Promise<BrowserStorage | null> => {
  if (!navigator.storage?.estimate || !navigator.storage.persisted) return null
  try {
    const [{ usage = 0, quota = 0 }, persisted] = await Promise.all([
      navigator.storage.estimate(),
      navigator.storage.persisted(),
    ])
    return { usage, quota, persisted }
  } catch (error) {
    console.error('Unable to read browser storage usage', error)
    return null
  }
}

export const readStorageSummary = async (): Promise<StorageSummary> => {
  const database = await openWorkspaceDatabase()
  const [stores, files, browser] = await Promise.all([
    Promise.all(
      Array.from(database.objectStoreNames, async name => ({
        name,
        records: await database.count(name),
      })),
    ),
    listStoredFiles(),
    readBrowserStorage(),
  ])
  return {
    databaseName: database.name,
    stores,
    fileBytes: files.reduce((total, file) => total + file.size, 0),
    browser,
  }
}
