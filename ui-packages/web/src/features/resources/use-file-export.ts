import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type ExportedFileVersion,
  ensureDirectoryWritePermission,
  type FolderExportRecord,
  findDirectoryConflicts,
  folderExportSupported,
  pickExportDirectory,
  pickerCancelled,
  saveBlobAs,
  type WritableDirectoryHandle,
  writeBlobToDirectory,
} from '../../core/file-export'
import type { StoredFileMetadata } from '../../core/files'
import { getStoredFile } from '../../data/file-store'
import { getFolderExport, putFolderExport } from '../../data/folder-export-store'

type PendingExport = {
  directory: WritableDirectoryHandle
  savedFiles: ExportedFileVersion[]
  names: string[]
}

type ExportResult = {
  saved: ExportedFileVersion[]
  failed: string[]
}

const writeStoredFiles = async (
  directory: FileSystemDirectoryHandle,
  files: readonly StoredFileMetadata[],
): Promise<ExportResult> => {
  const result: ExportResult = { saved: [], failed: [] }
  for (const file of files) {
    try {
      const stored = await getStoredFile(file.id)
      if (
        !stored ||
        stored.metadata.name !== file.name ||
        stored.metadata.revision !== file.revision
      ) {
        result.failed.push(file.name)
        continue
      }
      await writeBlobToDirectory(directory, file.name, stored.blob)
      result.saved.push({ id: file.id, name: file.name, revision: file.revision })
    } catch (error) {
      console.error(`Unable to export file: ${file.name}`, error)
      result.failed.push(file.name)
    }
  }
  return result
}

const mergeSavedFiles = (
  previous: readonly ExportedFileVersion[],
  saved: readonly ExportedFileVersion[],
) => {
  const versions = new Map(previous.map(file => [file.id, file]))
  saved.forEach(file => {
    versions.set(file.id, file)
  })
  return [...versions.values()]
}

const failureMessage = (failed: readonly string[], total: number) => {
  const shown = failed.slice(0, 3).join(', ')
  const remaining = failed.length > 3 ? ` and ${failed.length - 3} more` : ''
  return `${total - failed.length} of ${total} files saved. Could not save ${shown}${remaining}.`
}

export const useFileExport = (allFiles: readonly StoredFileMetadata[]) => {
  const supported = folderExportSupported()
  const files = useMemo(
    () => allFiles.filter(file => (file.collection ?? 'files') === 'files'),
    [allFiles],
  )
  const [target, setTarget] = useState<FolderExportRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingFileId, setSavingFileId] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingExport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void getFolderExport()
      .then(
        stored => {
          if (active) setTarget(stored)
        },
        cause => {
          console.error('Unable to load the saved export folder', cause)
          if (active) setError('The saved folder could not be opened. Choose it again.')
        },
      )
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const dirty = useMemo(() => {
    if (!target) return false
    const saved = new Map(target.savedFiles.map(file => [file.id, file]))
    return files.some(file => {
      const version = saved.get(file.id)
      return !version || version.name !== file.name || version.revision !== file.revision
    })
  }, [files, target])

  const saveFiles = useCallback(
    async (
      directory: WritableDirectoryHandle,
      savedFiles: ExportedFileVersion[],
      overwrite: boolean,
    ) => {
      setSaving(true)
      setError(null)
      setAnnouncement(null)
      try {
        if (!(await ensureDirectoryWritePermission(directory))) {
          setError('Folder access was not granted. Files remain saved in this browser.')
          return
        }
        if (!overwrite) {
          const names = await findDirectoryConflicts(directory, files, savedFiles)
          if (names.length > 0) {
            setPending({ directory, savedFiles, names })
            return
          }
        }
        const result = await writeStoredFiles(directory, files)
        if (result.saved.length > 0) {
          const record: FolderExportRecord = {
            id: 'files',
            directory,
            savedFiles: mergeSavedFiles(savedFiles, result.saved),
            savedAt: Date.now(),
          }
          setTarget(record)
          try {
            await putFolderExport(record)
          } catch (cause) {
            console.error('Unable to remember the export folder', cause)
            setError('Files were saved, but this folder could not be remembered.')
            return
          }
        }
        if (result.failed.length > 0) {
          setError(failureMessage(result.failed, files.length))
          return
        }
        setAnnouncement(`${files.length} files saved to ${directory.name}.`)
      } catch (cause) {
        if (pickerCancelled(cause)) return
        console.error('Unable to save files to a folder', cause)
        setError('Files could not be saved to this folder. They remain available in this browser.')
      } finally {
        setSaving(false)
      }
    },
    [files],
  )

  const chooseDirectory = useCallback(async () => {
    if (!supported || loading || saving || savingFileId) return
    setError(null)
    setAnnouncement(null)
    try {
      const directory = await pickExportDirectory(target?.directory)
      await saveFiles(directory, [], false)
    } catch (cause) {
      if (pickerCancelled(cause)) return
      console.error('Unable to choose an export folder', cause)
      setError('A folder could not be selected. Files remain saved in this browser.')
    }
  }, [loading, saveFiles, saving, savingFileId, supported, target])

  const saveToFolder = useCallback(async () => {
    if (!target) {
      await chooseDirectory()
      return
    }
    if (loading || saving || savingFileId) return
    await saveFiles(target.directory, target.savedFiles, false)
  }, [chooseDirectory, loading, saveFiles, saving, savingFileId, target])

  const confirmOverwrite = useCallback(async () => {
    const current = pending
    if (!current) return
    setPending(null)
    await saveFiles(current.directory, current.savedFiles, true)
  }, [pending, saveFiles])

  const saveAs = useCallback(
    async (fileId: string) => {
      if (saving || savingFileId) return
      setSavingFileId(fileId)
      setError(null)
      setAnnouncement(null)
      try {
        const stored = await getStoredFile(fileId)
        if (!stored) throw new Error(`Stored file not found: ${fileId}`)
        await saveBlobAs(stored.metadata.name, stored.blob)
        setAnnouncement(`${stored.metadata.name} saved.`)
      } catch (cause) {
        if (pickerCancelled(cause)) return
        console.error('Unable to save a file', cause)
        setError('The file could not be saved. It remains available in this browser.')
      } finally {
        setSavingFileId(null)
      }
    },
    [saving, savingFileId],
  )

  return {
    supported,
    phase: loading ? ('loading' as const) : saving ? ('saving' as const) : ('idle' as const),
    targetName: target?.directory.name ?? null,
    dirty,
    savingFileId,
    conflicts: pending ? { folderName: pending.directory.name, names: pending.names } : null,
    error,
    announcement,
    saveToFolder,
    chooseAnotherFolder: chooseDirectory,
    confirmOverwrite,
    cancelOverwrite: () => setPending(null),
    saveAs,
    dismissError: () => setError(null),
  }
}

export type FileExportController = ReturnType<typeof useFileExport>
