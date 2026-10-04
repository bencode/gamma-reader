import { parseNote } from '@gamma-reader/links'
import { useEffect, useState } from 'react'
import { createStore } from 'zustand/vanilla'
import { decodeUtf8 } from '../../core/document-text'
import type { StoredFileMetadata } from '../../core/files'
import { getStoredFileContent } from '../../data/file-store'
import { deleteNotes, listNotes, putNote } from '../../data/notes-store'
import { graphOf, type NoteIndexState, planIndex, runIndex } from './note-index'

const progressDelay = 500

export type NoteIndexStore = ReturnType<typeof createNoteIndexStore>

const createNoteIndexStore = () =>
  createStore<NoteIndexState>(() => ({ graph: null, progress: null }))

// Keeps the library's link index in step with its files. Every change to the library brings a
// new list, which starts a run and stops the one before; only files whose revision changed are
// parsed, so after the first index a run is usually over at once. The state lives in a store of
// its own, so a run's progress reaches only what subscribes to it, never the whole workbench.
export const useNoteIndex = (files: readonly StoredFileMetadata[]) => {
  const [store] = useState(createNoteIndexStore)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    // A stopped run touches the database no more: a project being deleted waits for every
    // connection to close, and reopening one would hold it up.
    const run = async () => {
      const records = await listNotes()
      signal.throwIfAborted()
      const started = performance.now()
      await runIndex(planIndex(files, records), {
        read: getStoredFileContent,
        // A Markdown file that is not UTF-8 is recorded without a note.
        parse: async blob => {
          const text = decodeUtf8(await blob.arrayBuffer())
          return text === null ? null : parseNote(text)
        },
        store: putNote,
        remove: deleteNotes,
        // Progress shows only for a run that takes a while, such as a first index; a few
        // changed files are done before a line could be read.
        onProgress: next => {
          if (signal.aborted || performance.now() - started < progressDelay) return
          store.setState({ progress: next.done < next.total ? next : null })
        },
        signal,
      })
      const indexed = await listNotes()
      signal.throwIfAborted()
      store.setState({ graph: graphOf(files, indexed), progress: null })
    }
    run().catch((cause: unknown) => {
      // A newer list stopped this run, and that run takes over.
      if (signal.aborted) return
      console.error('Unable to index the links between notes', cause)
      store.setState({ progress: null })
    })
    return () => controller.abort()
  }, [files, store])

  return store
}
