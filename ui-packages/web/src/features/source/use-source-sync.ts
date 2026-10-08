import type { SaveResult, SourceFile } from '@gamma-reader/shared/source-protocol'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { StoredFileMetadata } from '../../core/files'
import type { ProjectSource } from '../../core/projects'
import { importStoredFiles, listStoredFiles, removeStoredFiles } from '../../data/file-store'
import { workspaceStorageBases, workspaceStorageKey } from '../../data/workspace-database'
import { baseName } from '../../utils/path'
import {
  planSave,
  planSync,
  type SyncSnapshot,
  saveReady,
  snapshotAfter,
  snapshotAfterSave,
} from './plan'
import { isSourceListing, SourceError, sourceFileUrl } from './protocol'
import { saveToSource } from './save'

export type SourceSyncState =
  | { kind: 'checking' }
  | { kind: 'current' }
  | { kind: 'available'; replaces: string[] }
  | { kind: 'syncing'; done: number; total: number }
  | { kind: 'synced'; kept: string[]; replaced: string[]; refused: number }
  | { kind: 'saving'; total: number }
  | { kind: 'saved'; results: SaveResult[] }
  | { kind: 'failed'; message: string }

// The source is checked when the library opens and whenever the reader comes back to it, but
// not more than once a minute. A writable source is also checked every minute, and its changes
// come in without asking: what is edited here stays until Save, so nothing here is lost.
const checkInterval = 60_000
const downloadsAtOnce = 6

const snapshotKey = () => workspaceStorageKey(workspaceStorageBases.sourceSync)

const readSnapshot = (): SyncSnapshot | null => {
  const raw = localStorage.getItem(snapshotKey())
  return raw ? (JSON.parse(raw) as SyncSnapshot) : null
}

const writeSnapshot = (snapshot: SyncSnapshot) =>
  localStorage.setItem(snapshotKey(), JSON.stringify(snapshot))

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

// Brings the source in and records what the library then holds.
const pull = async (source: ProjectSource, onProgress: (done: number, total: number) => void) => {
  const previous = readSnapshot()
  const listing = await fetchListing(source)
  const plan = planSync(previous, listing, await libraryFiles(), source.writable === true)
  onProgress(0, plan.download.length)
  const downloaded = await downloadAll(source, plan.download, done =>
    onProgress(done, plan.download.length),
  )
  const result = await importStoredFiles(downloaded, 'replace')
  if (plan.remove.length) await removeStoredFiles(plan.remove)
  writeSnapshot(snapshotAfter(listing, await libraryFiles(), { kept: plan.kept, previous, source }))
  return { kept: plan.kept, replaced: plan.replaced, refused: result.rejected.length }
}

export const useSourceSync = (
  source: ProjectSource | null,
  reload: () => Promise<void>,
  files: readonly StoredFileMetadata[],
) => {
  const [state, setState] = useState<SourceSyncState>({ kind: 'checking' })
  const [confirming, setConfirming] = useState<string[] | null>(null)
  const busy = useRef(false)
  const checkedAt = useRef(0)

  const sync = async () => {
    if (!source || busy.current) return
    busy.current = true
    try {
      const { kept, replaced, refused } = await pull(source, (done, total) =>
        setState({ kind: 'syncing', done, total }),
      )
      await reload()
      checkedAt.current = Date.now()
      setState({ kind: 'synced', kept, replaced, refused })
    } catch (cause) {
      setState(failure(cause))
    } finally {
      busy.current = false
    }
  }
  // The latest sync, for a check that finds updates to bring in on its own.
  const latestSync = useRef(sync)
  useEffect(() => {
    latestSync.current = sync
  })

  const check = useCallback(
    async (scheduled = false) => {
      if (!source || busy.current) return
      if (!scheduled && Date.now() - checkedAt.current < checkInterval) return
      checkedAt.current = Date.now()
      try {
        const listing = await fetchListing(source)
        if (busy.current) return
        const snapshot = readSnapshot()
        if (snapshot?.version === listing.version) setState({ kind: 'current' })
        // A writable source, or one never synced here, comes in at once; otherwise the reader
        // is told what an update would replace, and decides.
        else if (source.writable || !snapshot) await latestSync.current()
        else
          setState({
            kind: 'available',
            replaces: planSync(snapshot, listing, await libraryFiles()).replaced,
          })
      } catch (cause) {
        if (!busy.current) setState(failure(cause))
      }
    },
    [source],
  )

  useEffect(() => {
    void check()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onVisible)
    const timer = source?.writable ? setInterval(() => void check(true), checkInterval) : undefined
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [check, source])

  const save = async () => {
    const snapshot = readSnapshot()
    if (!source || busy.current || !saveReady(snapshot, source) || !snapshot) return
    busy.current = true
    try {
      const local = await libraryFiles()
      const changes = planSave(snapshot, local)
      if (changes.length === 0) return
      setState({ kind: 'saving', total: changes.length })
      const results = await saveToSource(source, changes)
      writeSnapshot(snapshotAfterSave(snapshot, results, local))
      await pull(source, () => undefined)
      await reload()
      checkedAt.current = Date.now()
      setState({ kind: 'saved', results })
    } catch (cause) {
      setState(failure(cause))
    } finally {
      busy.current = false
    }
  }

  // The snapshot changes only when a sync or save ends, which also sets the state, so the two
  // together say when to work the changes out again.
  // A project without a source has no snapshot, and is not asked for one: its storage may be
  // blocked.
  const pending = useMemo(() => {
    if (!source || state.kind === 'syncing' || state.kind === 'saving')
      return { changes: null, ready: false }
    const snapshot = readSnapshot()
    return {
      changes: snapshot ? planSave(snapshot, files.filter(inLibrary)) : null,
      ready: saveReady(snapshot, source),
    }
  }, [files, source, state])
  const deletions = (pending.changes ?? []).flatMap(change =>
    change.kind === 'delete' ? [change.path] : [],
  )

  return {
    state,
    sync,
    localChanges: pending.changes?.length ?? files.filter(inLibrary).length,
    writable: source?.writable === true,
    // A library synced from another folder, or whose sync record is gone, is never saved.
    saveBlocked: source?.writable === true && !pending.ready,
    busy: state.kind === 'syncing' || state.kind === 'saving',
    // Deleting files on disk is asked about first; everything else saves at once.
    requestSave: () => {
      if (deletions.length > 0) setConfirming(deletions)
      else void save()
    },
    confirming,
    confirmSave: () => {
      setConfirming(null)
      void save()
    },
    cancelSave: () => setConfirming(null),
  }
}

export type SourceSync = ReturnType<typeof useSourceSync>
