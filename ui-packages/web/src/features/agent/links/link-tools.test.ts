import { buildGraph, type ParsedNote, parseNote } from '@gamma-reader/links'
import { describe, expect, it } from 'vitest'
import type { NoteIndexState } from '../../links/note-index'
import { createLinkTools, type LinkWrites, noLinks } from './link-tools'

const files = [
  { id: 'rag', path: 'knowledge/RAG.md' },
  { id: 'journal', path: 'journal/today.md' },
  { id: 'a', path: 'one/Shared.md' },
  { id: 'b', path: 'two/Shared.md' },
  { id: 'paper', path: 'papers/paper.pdf' },
]
const notes = new Map<string, ParsedNote>([
  ['rag', parseNote('# RAG\n\nRetrieval first. ^def\n\n## Later\nCites [[paper.pdf#page=3]].')],
  [
    'journal',
    parseNote('- Reading [[RAG#^def]] today ^reading\n  - and #[[agents]]\n\n![[RAG#Later]]'),
  ],
  ['a', parseNote('# A\n\nOne. ^x')],
  ['b', parseNote('# B')],
])
const ready = (): NoteIndexState => ({ graph: buildGraph(files, notes), progress: null })
const tools = createLinkTools({ ...noLinks, state: ready })

describe('link tools', () => {
  it('finds nodes by name as links write them, virtual pages included', () => {
    expect(tools.find_nodes({ query: 'agent' })).toEqual({
      total: 1,
      nodes: [{ node: 'agents', kind: 'page', references: 1, virtual: true }],
      next: null,
    })
  })

  it('shows a page outline whose entries name the nodes to follow', () => {
    expect(tools.get_node({ node: 'rag' })).toEqual({
      node: 'RAG',
      kind: 'page',
      files: [{ fileId: 'rag', path: 'knowledge/RAG.md' }],
      outline: [
        { node: 'RAG#RAG', kind: 'section', level: 1, lines: [1, 6] },
        {
          node: 'RAG#^def',
          kind: 'block',
          type: 'paragraph',
          lines: [3, 3],
          text: 'Retrieval first.',
        },
        { node: 'RAG#Later', kind: 'section', level: 2, lines: [5, 6] },
      ],
      next: null,
    })
    expect(tools.get_node({ node: 'RAG#^def' })).toEqual({
      node: 'RAG#^def',
      kind: 'block',
      fileId: 'rag',
      path: 'knowledge/RAG.md',
      lines: [3, 3],
      text: 'Retrieval first.',
    })
  })

  it('asks for a fileId when files share a name, and says when a node does not exist', () => {
    expect(tools.get_node({ node: 'shared' })).toMatchObject({
      files: [
        { fileId: 'a', path: 'one/Shared.md' },
        { fileId: 'b', path: 'two/Shared.md' },
      ],
      note: expect.stringContaining('fileId'),
      outline: [],
    })
    expect(tools.get_node({ node: 'Shared#^x', fileId: 'a' })).toMatchObject({ text: 'One.' })
    expect(() => tools.get_node({ node: 'Shared#^x' })).toThrow('Pass fileId')
    expect(() => tools.get_node({ node: 'Nobody' })).toThrow('No node named Nobody')
  })

  it('follows links in and out, each starting at a node it can follow again', () => {
    expect(tools.get_links({ node: 'RAG', direction: 'in' }).links).toEqual([
      {
        from: {
          node: 'today#^reading',
          fileId: 'journal',
          path: 'journal/today.md',
          line: 1,
        },
        to: 'RAG#^def',
        kind: 'link',
        context: '- Reading [[RAG#^def]] today ^reading',
      },
      {
        from: { node: 'today', fileId: 'journal', path: 'journal/today.md', line: 4 },
        to: 'RAG#Later',
        kind: 'embed',
        context: '![[RAG#Later]]',
      },
    ])
    expect(tools.get_links({ node: 'RAG', direction: 'out' }).links).toEqual([
      expect.objectContaining({
        to: 'paper.pdf#page=3',
        from: expect.objectContaining({ section: 'Later' }),
      }),
    ])
    expect(
      tools.get_links({ node: 'today#^reading', direction: 'out' }).links.map(link => link.to),
    ).toEqual(['RAG#^def', 'agents'])
  })

  it('continues long results with a cursor tied to its request', () => {
    const many = new Map([
      ['hub', parseNote(Array.from({ length: 250 }, (_, i) => `- [[Target]] ${i}`).join('\n'))],
    ])
    const paged = createLinkTools({
      ...noLinks,
      state: () => ({
        graph: buildGraph([{ id: 'hub', path: 'hub.md' }], many),
        progress: { done: 1, total: 3 },
      }),
    })

    const first = paged.get_links({ node: 'Target', direction: 'in' })
    const cursor = first.next?.cursor as string
    // A model may reorder the fields it copies back, or drop an empty one.
    const second = paged.get_links({ direction: 'in', node: 'Target', fileId: undefined, cursor })

    expect(first.total).toBe(250)
    expect(first.links).toHaveLength(100)
    expect(cursor).toMatch(/^100\.[0-9a-z]+$/)
    expect(first.indexing).toEqual({ done: 1, total: 3 })
    expect(second.links[0]?.from.line).toBe(101)
    expect(() => paged.get_links({ node: 'Target', direction: 'out', cursor })).toThrow(
      'Cursor does not match',
    )
    expect(() => paged.get_links({ node: 'Target', direction: 'in', cursor: 'x1Zx' })).toThrow(
      'Invalid cursor',
    )
  })

  it('waits for the first index', () => {
    const waiting = createLinkTools({
      ...noLinks,
      state: () => ({ graph: null, progress: { done: 0, total: 9 } }),
    })

    expect(() => waiting.find_nodes({ query: '' })).toThrow('still being indexed')
  })
})

describe('naming a block', () => {
  const library = (text: string, options: { dirty?: boolean; conflict?: boolean } = {}) => {
    const saved = { text, revision: 4 }
    const writes: LinkWrites = {
      file: id =>
        id === 'rag'
          ? {
              id,
              path: 'knowledge/RAG.md',
              revision: saved.revision,
              collection: 'files',
              mediaType: 'text/markdown',
              previewKind: 'markdown',
              size: saved.text.length,
              lastModified: 0,
              createdAt: 0,
            }
          : undefined,
      dirty: () => options.dirty ?? false,
      read: async () => saved.text,
      update: async (_id, revision, content) => {
        if (options.conflict || revision !== saved.revision) return { status: 'conflict' }
        Object.assign(saved, { text: content, revision: revision + 1 })
        return { status: 'saved', metadata: writes.file('rag') as never }
      },
    }
    return { saved, tools: createLinkTools({ ...writes, state: ready }) }
  }

  it('names the passage in the saved note and returns the link to write', async () => {
    const { saved, tools: naming } = library('# RAG\n\nRetrieval comes first.\n')

    expect(
      await naming.name_block({ fileId: 'rag', quote: 'comes first', name: 'retrieval-first' }),
    ).toEqual({
      node: 'RAG#^retrieval-first',
      link: '[[RAG#^retrieval-first]]',
      created: true,
    })
    expect(saved).toEqual({
      text: '# RAG\n\nRetrieval comes first. ^retrieval-first\n',
      revision: 5,
    })
  })

  it('keeps a name the passage has without saving anything', async () => {
    const { saved, tools: naming } = library('Retrieval comes first. ^def')

    expect(await naming.name_block({ fileId: 'rag', quote: 'first', name: 'other' })).toMatchObject(
      {
        link: '[[RAG#^def]]',
        created: false,
      },
    )
    expect(saved.revision).toBe(4)
  })

  it('leaves a note with unsaved edits, a changed note and a missing quote alone', async () => {
    const quote = { fileId: 'rag', quote: 'first', name: 'first' }

    await expect(library('First.', { dirty: true }).tools.name_block(quote)).rejects.toThrow(
      'unsaved changes',
    )
    await expect(library('First.', { conflict: true }).tools.name_block(quote)).rejects.toThrow(
      'changed while it was being named',
    )
    await expect(
      library('First.').tools.name_block({ ...quote, quote: 'nowhere' }),
    ).rejects.toThrow('No passage holds that quote')
    await expect(library('First.').tools.name_block({ ...quote, fileId: 'pdf' })).rejects.toThrow(
      'Markdown note',
    )
  })
})
