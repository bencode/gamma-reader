import { describe, expect, it } from 'vitest'
import { buildGraph, formatNode, nodeRef, pageNameOf } from './graph'
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

const lines = (...text: string[]) => parseNote(text.join('\n'))

const notes = new Map<string, ParsedNote>([
  [
    'rag',
    lines(
      '# RAG',
      '',
      'Retrieval first. ^def',
      '',
      '## Methods',
      '',
      '- Sparse with BM25 ^sparse',
      '  - see [[Tokenizer]]',
      '- Dense, unlike [[Retrieval]]',
      '',
      '## Later',
      'Cites [[sutton.pdf#page=12]].',
    ),
  ],
  ['lab', lines('# Lab', '', 'Builds on [[rag#^def]]. ^builds')],
  ['index', lines('---', 'name: Knowledge index', '---', '# Index', '- [[RAG]]', '- [[README]]')],
  ['other-readme', lines('# Notes')],
  [
    'journal',
    lines(
      'Read [[sutton.pdf#page=12]] today. #[[Agents]]',
      '',
      '![[RAG#^def]]',
      '',
      '[[agents]] again.',
      '',
      'See [[RAG#methods]].',
    ),
  ],
])

const graph = buildGraph(files, notes)
const at = (edges: ReturnType<typeof graph.edges>) =>
  edges.map(edge => `${edge.from.fileId}:${edge.from.line} → ${formatNode(edge.to)}`)

describe('nodes and names', () => {
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

  it('addresses a node in link syntax, a PDF page being an anchor rather than a node', () => {
    for (const raw of ['RAG', 'RAG#^def', 'RAG#Methods']) expect(formatNode(nodeRef(raw))).toBe(raw)
    expect(nodeRef('paper.pdf#page=3')).toEqual({ page: 'paper.pdf' })
  })

  it('resolves a name to one file, to a virtual page, or to every file that shares it', () => {
    expect(graph.resolve({ page: 'RAG' })).toEqual({ kind: 'file', fileId: 'rag' })
    expect(graph.resolve({ page: 'Agents' })).toEqual({ kind: 'virtual', page: 'agents' })
    expect(graph.resolve({ page: 'Sutton.PDF', pdfPage: 12 })).toEqual({
      kind: 'ambiguous',
      fileIds: ['paper', 'paper-copy'],
    })
    expect(graph.resolve({ page: 'README' })).toEqual({ kind: 'file', fileId: 'other-readme' })
  })
})

describe('inside a node', () => {
  it('shows a page with its sections and blocks in source order', () => {
    const view = graph.node(nodeRef('rag'))

    expect(view?.kind === 'page' && view.files).toEqual([files[0]])
    expect(
      view?.kind === 'page' &&
        view.outline.map(entry =>
          entry.kind === 'section' ? `§${entry.title}` : `^${entry.name}`,
        ),
    ).toEqual(['§RAG', '^def', '§Methods', '^sparse', '§Later'])
  })

  it('shows a block or section with its file, lines and text', () => {
    expect(graph.node(nodeRef('RAG#^sparse'))).toEqual({
      kind: 'block',
      ref: { page: 'RAG', block: 'sparse' },
      file: files[0],
      lines: [7, 8],
      text: 'Sparse with BM25',
    })
    expect(graph.node(nodeRef('rag#methods'))).toMatchObject({
      ref: { page: 'RAG', heading: 'Methods' },
      lines: [5, 9],
      text: 'Methods',
    })
  })

  it('knows a virtual page, a page two files share, and a name nobody uses', () => {
    expect(graph.node(nodeRef('Agents'))).toEqual({
      kind: 'page',
      ref: { page: 'Agents' },
      files: [],
      outline: [],
    })
    expect(graph.node(nodeRef('sutton.pdf'))).toMatchObject({ files: [files[4], files[5]] })
    expect(graph.node(nodeRef('sutton.pdf'), 'paper')).toMatchObject({ files: [files[4]] })
    expect(graph.node(nodeRef('Nobody'))).toBeNull()
    expect(graph.node(nodeRef('RAG#^missing'))).toBeNull()
  })
})

describe('edges', () => {
  it('follows edges into a page, gathering those to its blocks and sections', () => {
    expect(at(graph.edges(nodeRef('RAG'), 'in'))).toEqual([
      'lab:3 → rag#^def',
      'index:5 → RAG',
      'journal:3 → RAG#^def',
      'journal:7 → RAG#methods',
    ])
    expect(at(graph.edges(nodeRef('rag#^def'), 'in'))).toEqual([
      'lab:3 → rag#^def',
      'journal:3 → RAG#^def',
    ])
    expect(at(graph.edges(nodeRef('RAG#Methods'), 'in'))).toEqual(['journal:7 → RAG#methods'])
  })

  it('follows edges out of a page, or only those written inside one of its blocks or sections', () => {
    expect(at(graph.edges(nodeRef('RAG'), 'out'))).toEqual([
      'rag:8 → Tokenizer',
      'rag:9 → Retrieval',
      'rag:12 → sutton.pdf',
    ])
    expect(at(graph.edges(nodeRef('RAG#^sparse'), 'out'))).toEqual(['rag:8 → Tokenizer'])
    expect(at(graph.edges(nodeRef('RAG#Methods'), 'out'))).toEqual([
      'rag:8 → Tokenizer',
      'rag:9 → Retrieval',
    ])
  })

  it('starts each edge at the innermost block and section around its line', () => {
    const [tokenizer] = graph.edges(nodeRef('Tokenizer'), 'in')
    const [builds] = graph.edges(nodeRef('Retrieval'), 'out')
    const nested = buildGraph(
      [{ id: 'n', path: 'n.md' }],
      new Map([['n', lines('- outer ^outer', '  - inner [[X]] ^inner')]]),
    )

    expect(tokenizer?.from).toEqual({
      fileId: 'rag',
      path: 'knowledge/ai/RAG.md',
      page: 'RAG',
      line: 8,
      block: 'sparse',
      section: 'Methods',
    })
    expect(builds?.from).toMatchObject({ page: 'Retrieval', block: 'builds', section: 'Lab' })
    expect(nested.edges(nodeRef('X'), 'in')[0]?.from.block).toBe('inner')
    expect(graph.edges(nodeRef('sutton.pdf'), 'in').map(edge => edge.to.pdfPage)).toEqual([12, 12])
    expect(graph.edges(nodeRef('agents'), 'in').map(edge => edge.kind)).toEqual(['tag', 'link'])
  })
})

describe('finding nodes', () => {
  it('finds pages, sections and blocks by name, the most linked first', () => {
    expect(graph.find('meth').map(found => [formatNode(found.ref), found.references])).toEqual([
      ['RAG#Methods', 1],
    ])
    const named = graph.find('r').map(found => [formatNode(found.ref), found.references])
    expect(named[0]).toEqual(['RAG', 4])
    expect(named).toContainEqual(['RAG#^sparse', 0])
    expect(graph.find('agent')).toEqual([
      { ref: { page: 'Agents' }, kind: 'page', references: 2, virtual: true },
    ])
  })

  it('lists only pages for an empty query', () => {
    expect(new Set(graph.find('').map(found => found.kind))).toEqual(new Set(['page']))
  })
})
