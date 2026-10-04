import { nodeRef, parseNote } from '@gamma-reader/links'
import { describe, expect, it, vi } from 'vitest'
import { maximumTextPreviewBytes } from '../../core/files'
import { deleteNotes, listNotes, type NoteRecord, putNote } from '../../data/notes-store'
import { graphOf, type IndexProgress, planIndex, runIndex } from './note-index'

const file = (id: string, path: string, revision = 1, size = 10) => ({
  id,
  path,
  revision,
  size,
  collection: 'files' as const,
})
const record = (fileId: string, revision = 1): NoteRecord => ({
  fileId,
  revision,
  note: parseNote(''),
})

describe('planning an index', () => {
  it('parses new and changed notes, keeps moved ones, and drops what left the library', () => {
    const files = [
      file('new', 'notes/new.md'),
      file('changed', 'notes/changed.md', 2),
      file('moved', 'archive/moved.lab.md'),
      file('same', 'notes/same.md'),
      file('paper', 'papers/paper.pdf'),
      { ...file('attached', 'chat/attached.md'), collection: 'attachments' as const },
    ]
    const records = [record('changed', 1), record('moved'), record('same'), record('gone')]

    const plan = planIndex(files, records)

    expect(plan.parse.map(entry => entry.id)).toEqual(['new', 'changed'])
    expect(plan.remove).toEqual(['gone'])
  })
})

const text = (value: string) => new Blob([value])

describe('running an index', () => {
  const steps = (blobs: Record<string, Blob | null>, signal = new AbortController().signal) => {
    const progress: IndexProgress[] = []
    return {
      progress,
      steps: {
        read: async (id: string) => blobs[id] ?? null,
        parse: async (blob: Blob) => parseNote(await blob.text()),
        store: putNote,
        remove: deleteNotes,
        onProgress: (next: IndexProgress) => progress.push(next),
        signal,
      },
    }
  }

  it('stores each note with its revision, reports progress, and builds the graph from them', async () => {
    await putNote(record('gone'))
    const files = [
      file('rag', 'knowledge/RAG.md', 3),
      file('journal', 'journal/today.md'),
      file('huge', 'notes/huge.md', 1, maximumTextPreviewBytes + 1),
      file('left', 'notes/left.md'),
    ]
    const { steps: run, progress } = steps({
      rag: text('# RAG\n\nRetrieval first. ^def'),
      journal: text('Read [[RAG#^def]] and #[[agents]].'),
    })

    await runIndex(planIndex(files, await listNotes()), run)

    const records = await listNotes()
    expect(records.map(entry => [entry.fileId, entry.revision, entry.note !== null])).toEqual([
      ['huge', 1, false],
      ['journal', 1, true],
      ['rag', 3, true],
    ])
    expect(progress).toEqual([0, 1, 2, 3, 4].map(done => ({ done, total: 4 })))
    const graph = graphOf(files, records)
    expect(graph.resolve({ page: 'rag' })).toEqual({ kind: 'file', fileId: 'rag' })
    expect(graph.edges(nodeRef('RAG#^def'), 'in').map(edge => edge.from.fileId)).toEqual([
      'journal',
    ])
    expect(planIndex(files, records).parse.map(entry => entry.id)).toEqual(['left'])
  })

  it('stops between files once a newer run takes over, keeping what it finished', async () => {
    const controller = new AbortController()
    const { steps: run } = steps({ a: text('[[B]]'), b: text('[[C]]') }, controller.signal)
    const store = vi.fn(async (entry: NoteRecord) => {
      await putNote(entry)
      controller.abort()
    })

    await expect(
      runIndex(planIndex([file('a', 'a.md'), file('b', 'b.md')], []), { ...run, store }),
    ).rejects.toThrow()

    expect(store).toHaveBeenCalledTimes(1)
    expect((await listNotes()).map(entry => entry.fileId)).toEqual(['a'])
  })
})
