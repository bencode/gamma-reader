import { openDB } from 'idb'
import { describe, expect, it, vi } from 'vitest'
import { legacyDatabaseName } from '../core/projects'
import {
  closeWorkspaceDatabase,
  deleteIndexedDatabase,
  openWorkspaceDatabase,
} from './workspace-database'

describe('workspace database', () => {
  it('lets go of the library when a newer page upgrades it', async () => {
    await openWorkspaceDatabase()

    const newer = await openDB(legacyDatabaseName, 9)

    expect(newer.version).toBe(9)
    newer.close()
  })

  it('keeps the library open while another tab deletes it', async () => {
    const database = await openWorkspaceDatabase()
    const blocked = vi.fn()

    const deletion = deleteIndexedDatabase(legacyDatabaseName, blocked)

    await vi.waitFor(() => expect(blocked).toHaveBeenCalledOnce())
    // A closed connection would refuse the read.
    await expect(database.count('files')).resolves.toBeGreaterThan(0)
    await closeWorkspaceDatabase()
    await deletion
  })
})
