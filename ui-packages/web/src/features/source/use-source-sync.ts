import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { baseName, type StoredFileMetadata } from '../../core/files'
import type { ProjectSource } from '../../core/projects'
import { importStoredFiles, listStoredFiles, removeStoredFiles } from '../../data/file-store'
import { workspaceStorageBases, workspaceStorageKey } from '../../data/workspace-database'
import { localChanges, planSync, type SyncSnapshot, snapshotAfter } from './plan'
import { isSourceListing, type SourceFile, sourceFileUrl } from './protocol'

export type SourceSyncState =
  | { kind: 'checking' }
  | { kind: 'current' }
  | { kind: 'available' }
  | { kind: 'syncing'; done: number; total: number }
  | { kind: 'synced'; kept: string[]; refused: number }
  | { kind: 'failed'; message: string }

// The source is checked when the library opens and whenever the reader comes back to it, but
// not more than once a minute.
const checkInterval = 60_000
const downloadsAtOnce = 6

class SourceError extends Error {}

const snapshotKey = () => workspaceStorageKey(workspaceStorageBases.sourceSync)

const readSnapshot = (): SyncSnapshot | null => {
  const raw = localStorage.getItem(snapshotKey())
  return raw ? (JSON.parse(raw) as SyncSnapshot) : null
}

const fetchOk = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new SourceError(`The source returned HTTP ${response.status}.`)
  return response
}

const fetchListing = async (source: ProjectSource) => {
  const listing: unknown = await (await fetchOk(source.url)).json()
  if (!isSourceListing(listing))
    throw new SourceError('The source sent a listing it could not read.')
  return listing
}

const inLibrary = (file: StoredFileMetadata) => (file.collection ?? 'files') === 'files'

const libraryFiles = async () => (await listStoredFiles()).filter(inLibrary)

const downloadAll = async (
  source: ProjectSource,
  files: readonly SourceFile[],
  onDone: (done: number) => void,
) => {
  const sources: { path: string; file: File }[] = []
  let next = 0
  let done = 0
  const work = async () => {
    for (let index = next++; index < files.length; index = next++) {
      const { path } = files[index] as SourceFile
      const response = await fetchOk(sourceFileUrl(source, path))
      const type = response.headers.get('content-type')?.split(';')[0]?.trim() ?? ''
      sources[index] = { path, file: new File([await response.blob()], baseName(path), { type }) }
      done += 1
      onDone(done)
    }
  }
  await Promise.all(Array.from({ length: Math.min(downloadsAtOnce, files.length) }, work))
  return sources
}

const failure = (cause: unknown) => {
  console.error('Unable to sync the source', cause)
  return {
    kind: 'failed',
    message:
      cause instanceof SourceError ? cause.message : 'The source could not be reached. Try again.',
  } as const
}

export const useSourceSync = (
  source: ProjectSource,
  reload: () => Promise<void>,
  files: readonly StoredFileMetadata[],
) => {
  const [state, setState] = useState<SourceSyncState>({ kind: 'checking' })
  const busy = useRef(false)
  const checkedAt = useRef(0)

  const check = useCallback(async () => {
    if (busy.current || Date.now() - checkedAt.current < checkInterval) return
    checkedAt.current = Date.now()
    try {
      const listing = await fetchListing(source)
      if (!busy.current)
        setState({ kind: readSnapshot()?.version === listing.version ? 'current' : 'available' })
    } catch (cause) {
      if (!busy.current) setState(failure(cause))
    }
  }, [source])

  useEffect(() => {
    void check()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [check])

  const sync = async () => {
    if (busy.current) return
    busy.current = true
    try {
      const listing = await fetchListing(source)
      const plan = planSync(readSnapshot(), listing, await libraryFiles())
      setState({ kind: 'syncing', done: 0, total: plan.download.length })
      const downloaded = await downloadAll(source, plan.download, done =>
        setState({ kind: 'syncing', done, total: plan.download.length }),
      )
      const result = await importStoredFiles(downloaded, 'replace')
      if (plan.remove.length) await removeStoredFiles(plan.remove)
      localStorage.setItem(
        snapshotKey(),
        JSON.stringify(snapshotAfter(listing, await libraryFiles(), plan.kept)),
      )
      await reload()
      checkedAt.current = Date.now()
      setState({ kind: 'synced', kept: plan.kept, refused: result.rejected.length })
    } catch (cause) {
      setState(failure(cause))
    } finally {
      busy.current = false
    }
  }

  // The snapshot changes only when a sync ends, which also sets the state, so the two together say
  // when to count again.
  const changes = useMemo(
    () => (state.kind === 'syncing' ? 0 : localChanges(readSnapshot(), files.filter(inLibrary))),
    [files, state],
  )

  return { state, sync, localChanges: changes }
}
