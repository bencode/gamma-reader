import { useCallback, useEffect, useRef, useState } from 'react'
import { pickerCancelled } from '../../core/file-export'
import {
  duplicatePaths,
  type ImportResult,
  type ImportSource,
  rootSources,
  type StoredFileMetadata,
} from '../../core/files'
import {
  type FolderEntry,
  type FolderSelection,
  maximumFolderFiles,
  selectFolderFiles,
} from '../../core/folder-import'
import type { ImportTarget } from '../../core/url-import'
import {
  addStoredFile,
  importStoredFiles,
  listStoredFiles,
  moveStoredFile,
  removeStoredFiles,
  updateStoredTextFile,
  writeStoredTextFile,
} from '../../data/file-store'
import { downloadFile, downloadRepository, RemoteFileError } from '../../data/remote-files'
import { requestPersistentStorage } from '../../data/workspace-database'

type LibraryStatus = { message: string }

const rejectionMessage = (result: ImportResult) => {
  const tooLarge = result.rejected.filter(item => item.reason === 'file-too-large').length
  const libraryFull = result.rejected.filter(item => item.reason === 'library-full').length
  const unavailable = result.rejected.filter(item => item.reason === 'storage-unavailable').length
  const invalid = result.rejected.filter(item => item.reason === 'invalid-path').length
  const conflicting = result.rejected.filter(item => item.reason === 'path-conflict').length
  return [
    tooLarge > 0 ? `${tooLarge} over 200 MiB` : '',
    libraryFull > 0 ? `${libraryFull} over the 1 GiB library limit` : '',
    unavailable > 0 ? `${unavailable} could not fit in browser storage` : '',
    invalid > 0 ? `${invalid} with an invalid path` : '',
    conflicting > 0 ? `${conflicting} clashing with a file or folder of the same path` : '',
  ]
    .filter(Boolean)
    .join(', ')
}

const resultStatus = (result: ImportResult): LibraryStatus | null => {
  if (result.rejected.length === 0) return null
  const completed = result.addedIds.length + result.replacedIds.length
  const actions = [
    result.addedIds.length > 0 ? `${result.addedIds.length} added` : '',
    result.replacedIds.length > 0 ? `${result.replacedIds.length} replaced` : '',
  ].filter(Boolean)
  const rejected = rejectionMessage(result)
  return {
    message:
      completed === 0
        ? `No files added${rejected ? `: ${rejected}` : '.'}`
        : `${actions.join(', ')}${rejected ? `; skipped ${rejected}` : ''}.`,
  }
}

const fileCount = (count: number) => `${count.toLocaleString()} ${count === 1 ? 'file' : 'files'}`

// Like files, a folder speaks up only when something did not come in: refused or left out.
const folderStatus = (result: ImportResult, skipped: number): LibraryStatus | null => {
  const refused = resultStatus(result)
  if (skipped === 0) return refused
  const imported = result.addedIds.length + result.replacedIds.length
  return {
    message: `${refused?.message ?? `${fileCount(imported)} added.`} Left out ${fileCount(skipped)} that were hidden, oversized or unreadable.`,
  }
}

// The library holds copies, so a path already there is either refreshed or left as it is.
export type DuplicateChoice = 'replace' | 'skip'

// Files waiting on the duplicate question; a folder also remembers how many it left out.
type PendingImport = { sources: ImportSource[]; skipped: number | null }

const keepFile = (file: File) => file

export const useFileLibrary = (prepareFile: (file: File) => File = keepFile) => {
  const [files, setFiles] = useState<StoredFileMetadata[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<LibraryStatus | null>(null)
  // What an import is doing while it runs; a large folder takes seconds to read and store.
  const [progress, setProgress] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingImport | null>(null)
  const persistRequested = useRef(false)

  const reload = useCallback(async () => {
    try {
      const next = await listStoredFiles()
      setFiles(next)
      setError(null)
    } catch (cause) {
      console.error('Unable to load files', cause)
      setError('Files could not be opened in this browser.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const rememberPersistence = useCallback((changed = true) => {
    if (!persistRequested.current && changed) {
      persistRequested.current = true
      void requestPersistentStorage()
    }
  }, [])

  // Paths already in the library were settled before this point, so anything left replaces.
  const commitImport = async ({
    sources,
    skipped,
  }: PendingImport): Promise<ImportResult | null> => {
    setImporting(true)
    setStatus(null)
    try {
      setProgress(`Adding ${fileCount(sources.length)}…`)
      const prepared = sources.map(source => ({ ...source, file: prepareFile(source.file) }))
      const result = await importStoredFiles(prepared, 'replace')
      await reload()
      setStatus(skipped === null ? resultStatus(result) : folderStatus(result, skipped))
      rememberPersistence(result.imported.length > 0)
      return result
    } catch (cause) {
      console.error('Unable to import files', cause)
      setStatus({ message: 'Files could not be added. Try again.' })
      return null
    } finally {
      setImporting(false)
      setProgress(null)
    }
  }

  const addAttachments = useCallback(
    async (selected: readonly File[]) => {
      const result = await importStoredFiles(
        rootSources(selected.map(prepareFile)),
        'keep',
        'attachments',
      )
      await reload()
      rememberPersistence(result.imported.length > 0)
      return result
    },
    [prepareFile, reload, rememberPersistence],
  )

  const writeTextFile = useCallback(
    async (path: string, content: string, signal?: AbortSignal) => {
      const metadata = await writeStoredTextFile(path, content, signal)
      await reload()
      rememberPersistence()
      return metadata
    },
    [reload, rememberPersistence],
  )

  // Adds what the assistant downloaded, prepared as a file the reader adds would be.
  const saveFile = useCallback(
    async (path: string, file: File, signal?: AbortSignal) => {
      const metadata = await addStoredFile(path, prepareFile(file), signal)
      await reload()
      rememberPersistence()
      return metadata
    },
    [prepareFile, reload, rememberPersistence],
  )

  const moveFile = useCallback(
    async (id: string, path: string, signal?: AbortSignal) => {
      const moved = await moveStoredFile(id, path, signal)
      await reload()
      rememberPersistence()
      return moved
    },
    [reload, rememberPersistence],
  )

  const updateTextFile = useCallback(
    async (id: string, expectedRevision: number, content: string, signal?: AbortSignal) => {
      const result = await updateStoredTextFile(id, expectedRevision, content, signal)
      if (result.status === 'saved') rememberPersistence()
      if (result.status === 'saved' || result.status === 'conflict' || result.status === 'missing')
        await reload()
      return result
    },
    [reload, rememberPersistence],
  )

  // Null while the duplicate question is open, or when the import failed.
  const queueImport = async (next: PendingImport) => {
    if (duplicatePaths(next.sources, files).length === 0) return commitImport(next)
    setPending(next)
    return null
  }

  const addFiles = (selected: readonly File[]) => {
    if (selected.length === 0 || importing) return
    void queueImport({ sources: rootSources(selected), skipped: null })
  }

  const settleFolder = async (selection: FolderSelection) => {
    if (selection.status === 'too-many')
      setStatus({
        message: `This folder has more than ${maximumFolderFiles} readable files. Choose a smaller folder.`,
      })
    else if (selection.sources.length === 0)
      setStatus({ message: 'This folder has no files that can be read here.' })
    else await queueImport({ sources: selection.sources, skipped: selection.skipped })
  }

  // Reading a large folder takes a moment, so the library counts as importing while it does.
  const addFolder = async (
    load: (onRead: (count: number) => void) => Promise<readonly FolderEntry[]>,
  ) => {
    if (importing) return
    setImporting(true)
    setStatus(null)
    setProgress('Reading folder…')
    try {
      await settleFolder(
        selectFolderFiles(
          await load(count => setProgress(`Reading folder… ${count.toLocaleString()} files`)),
        ),
      )
    } catch (cause) {
      if (!pickerCancelled(cause)) {
        console.error('Unable to read the folder', cause)
        setStatus({ message: 'The folder could not be read. Try again.' })
      }
    } finally {
      setImporting(false)
      setProgress(null)
    }
  }

  const download = async <T>(name: string, run: () => Promise<T>) => {
    setImporting(true)
    setStatus(null)
    setProgress(`Downloading ${name}…`)
    try {
      return await run()
    } catch (cause) {
      console.error('Unable to download from the address', cause)
      setStatus({
        message:
          cause instanceof RemoteFileError
            ? cause.message
            : 'The address could not be downloaded. Try again.',
      })
      return null
    } finally {
      setImporting(false)
      setProgress(null)
    }
  }

  // A GitHub folder comes in as a chosen folder would. A single file resolves to its id, so it can
  // be opened, unless the duplicate question is still open.
  const addFromUrl = async (target: ImportTarget) => {
    if (importing) return undefined
    if (target.kind === 'repository') {
      const selection = await download(target.name, () =>
        downloadRepository(target, (done, total) =>
          setProgress(
            `Downloading ${target.name}… ${done.toLocaleString()} of ${fileCount(total)}`,
          ),
        ),
      )
      if (selection) await settleFolder(selection)
      return undefined
    }
    const file = await download(target.name, () => downloadFile(target))
    if (!file) return undefined
    const result = await queueImport({ sources: rootSources([file]), skipped: null })
    return result?.addedIds[0] ?? result?.replacedIds[0]
  }

  const resolveDuplicates = (choice: DuplicateChoice | null) => {
    const selected = pending
    setPending(null)
    if (!choice || !selected) return
    const existing = new Set(files.map(file => file.path.toLowerCase()))
    const sources =
      choice === 'replace'
        ? selected.sources
        : selected.sources.filter(source => !existing.has(source.path.toLowerCase()))
    if (sources.length > 0) void commitImport({ ...selected, sources })
  }

  const removeFiles = async (ids: readonly string[]) => {
    try {
      await removeStoredFiles(ids)
      const removed = new Set(ids)
      setFiles(current => current.filter(file => !removed.has(file.id)))
      return true
    } catch (cause) {
      console.error('Unable to remove files', cause)
      setStatus({ message: 'The browser copy could not be removed.' })
      return false
    }
  }

  return {
    files,
    loading,
    importing,
    error,
    status,
    progress,
    duplicatePaths: pending ? duplicatePaths(pending.sources, files) : [],
    addFiles,
    addFolder,
    addFromUrl,
    addAttachments,
    writeTextFile,
    saveFile,
    moveFile,
    updateTextFile,
    resolveDuplicates,
    removeFiles,
    reload,
    retry: () => {
      setLoading(true)
      void reload()
    },
    dismissStatus: () => setStatus(null),
  }
}

export type FileLibrary = ReturnType<typeof useFileLibrary>
