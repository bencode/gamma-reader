import { useCallback, useEffect, useRef, useState } from 'react'
import { duplicateNames, type ImportResult, type StoredFileMetadata } from '../../core/files'
import {
  type DuplicateMode,
  importStoredFiles,
  listStoredFiles,
  removeStoredFile,
  requestPersistentStorage,
  writeStoredTextFile,
} from '../../data/file-store'

type LibraryStatus = { message: string }

const rejectionMessage = (result: ImportResult) => {
  const tooLarge = result.rejected.filter(item => item.reason === 'file-too-large').length
  const libraryFull = result.rejected.filter(item => item.reason === 'library-full').length
  const unavailable = result.rejected.filter(item => item.reason === 'storage-unavailable').length
  return [
    tooLarge > 0 ? `${tooLarge} over 50 MB` : '',
    libraryFull > 0 ? `${libraryFull} over the 500 MB library limit` : '',
    unavailable > 0 ? `${unavailable} could not fit in browser storage` : '',
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

export const useFileLibrary = () => {
  const [files, setFiles] = useState<StoredFileMetadata[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<LibraryStatus | null>(null)
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null)
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

  const commitImport = async (selected: readonly File[], mode: DuplicateMode) => {
    setImporting(true)
    setStatus(null)
    try {
      const result = await importStoredFiles(selected, mode)
      await reload()
      setStatus(resultStatus(result))
      rememberPersistence(result.imported.length > 0)
    } catch (cause) {
      console.error('Unable to import files', cause)
      setStatus({ message: 'Files could not be added. Try again.' })
    } finally {
      setImporting(false)
    }
  }

  const addAttachments = useCallback(
    async (selected: readonly File[]) => {
      const result = await importStoredFiles(selected, 'keep', 'attachments')
      await reload()
      rememberPersistence(result.imported.length > 0)
      return result
    },
    [reload, rememberPersistence],
  )

  const writeTextFile = useCallback(
    async (name: string, content: string, signal?: AbortSignal) => {
      const metadata = await writeStoredTextFile(name, content, signal)
      await reload()
      rememberPersistence()
      return metadata
    },
    [reload, rememberPersistence],
  )

  const addFiles = (selected: readonly File[]) => {
    if (selected.length === 0 || importing) return
    const duplicates = duplicateNames(selected, files)
    if (duplicates.length > 0) setPendingFiles([...selected])
    else void commitImport(selected, 'keep')
  }

  const resolveDuplicates = (mode: DuplicateMode | null) => {
    const selected = pendingFiles
    setPendingFiles(null)
    if (mode && selected) void commitImport(selected, mode)
  }

  const removeFile = async (id: string) => {
    try {
      await removeStoredFile(id)
      setFiles(current => current.filter(file => file.id !== id))
      return true
    } catch (cause) {
      console.error('Unable to remove file', cause)
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
    duplicateNames: pendingFiles ? duplicateNames(pendingFiles, files) : [],
    addFiles,
    addAttachments,
    writeTextFile,
    resolveDuplicates,
    removeFile,
    retry: () => {
      setLoading(true)
      void reload()
    },
    dismissStatus: () => setStatus(null),
  }
}

export type FileLibrary = ReturnType<typeof useFileLibrary>
