import { describe, expect, it } from 'vitest'
import { buildGraph, pageNameOf } from './graph'
import { type ParsedNote, parseNote } from './parse'

const files = [
  { id: 'rag', path: 'knowledge/ai/RAG.md' },
  { id: 'lab', path: 'labs/Retrieval.lab.md' },
  { id: 'index', path: 'knowledge/README.md' },
  { id: 'other-readme', path: 'notes/README.md' },
  { id: 'paper', path: 'papers/Sutton.pdf' },
  { id: 'paper-copy', path: 'archive/sutton.pdf' },
  { id: 'journal', path: 'journal/2026-10-03.md' },
]

const notes = new Map<string, ParsedNote>([
  ['rag', parseNote('# RAG\n\nRetrieval first. ^def\n\nSee [[Retrieval]].')],
  ['lab', parseNote('# Lab\n\nBuilds on [[rag#^def]].')],
  ['index', parseNote('---\nname: Knowledge index\n---\n# Index\n- [[RAG]]\n- [[README]]')],
  ['other-readme', parseNote('# Notes')],
  [
    'journal',
    parseNote(
      'Read [[sutton.pdf#page=12]] today. #[[Agents]]\n\n![[RAG#^def]]\n\n[[agents]] again.',
    ),
  ],
])

const graph = buildGraph(files, notes)

describe('page names', () => {
  it('names notes without their extension, other files with it, and prefers a frontmatter name', () => {
    expect(files.map(file => pageNameOf(file, notes.get(file.id)))).toEqual([
      'rag',
      'retrieval',
      'knowledge index',
      'readme',
      'sutton.pdf',
      'sutton.pdf',
      '2026-10-03',
    ])
  })
})

describe('the link graph', () => {
  it('resolves a name to one file, to a virtual page, or to every file that shares it', () => {
    expect(graph.resolve({ page: 'RAG' })).toEqual({ kind: 'file', fileId: 'rag' })
    expect(graph.resolve({ page: 'Agents' })).toEqual({ kind: 'virtual', page: 'agents' })
    expect(graph.resolve({ page: 'Sutton.PDF', pdfPage: 12 })).toEqual({
      kind: 'ambiguous',
      fileIds: ['paper', 'paper-copy'],
    })
  })

  it('tells two files of the same name apart by a frontmatter name, not by their path', () => {
    expect(graph.resolve({ page: 'README' })).toEqual({ kind: 'file', fileId: 'other-readme' })
    expect(graph.resolve({ page: 'knowledge index' })).toEqual({ kind: 'file', fileId: 'index' })
  })

  it('finds who links to a page, or to one of its blocks', () => {
    const from = (page: string, block?: string) =>
      graph.backlinks(page, block).map(({ fileId, link }) => [fileId, link.line])

    expect(from('rag')).toEqual([
      ['lab', 3],
      ['index', 5],
      ['journal', 3],
    ])
    expect(from('RAG', 'def')).toEqual([
      ['lab', 3],
      ['journal', 3],
    ])
    expect(graph.backlinks('agents').map(({ link }) => link.tag)).toEqual([true, false])
  })

  it('lists every page with its files and how often it is linked, virtual ones included', () => {
    expect(graph.pages().filter(page => page.references > 0)).toEqual([
      { page: 'agents', title: 'Agents', fileIds: [], references: 2 },
      { page: 'rag', title: 'RAG', fileIds: ['rag'], references: 3 },
      { page: 'readme', title: 'README', fileIds: ['other-readme'], references: 1 },
      { page: 'retrieval', title: 'Retrieval', fileIds: ['lab'], references: 1 },
      {
        page: 'sutton.pdf',
        title: 'Sutton.pdf',
        fileIds: ['paper', 'paper-copy'],
        references: 1,
      },
    ])
  })
})
