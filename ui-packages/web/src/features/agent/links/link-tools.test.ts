import { buildGraph, type ParsedNote, parseNote } from '@gamma-reader/links'
import { describe, expect, it } from 'vitest'
import { createLinkTools, type LinkState } from './link-tools'

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
const ready = (): LinkState => ({ graph: buildGraph(files, notes), progress: null })
const tools = createLinkTools(ready)

describe('link tools', () => {
  it('finds nodes by name as links write them, virtual pages included', () => {
    expect(tools.find_nodes({ query: 'agent' })).toEqual({
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
    const paged = createLinkTools(() => ({
      graph: buildGraph([{ id: 'hub', path: 'hub.md' }], many),
      progress: { done: 1, total: 3 },
    }))

    const first = paged.get_links({ node: 'Target', direction: 'in' })
    const second = paged.get_links({
      node: 'Target',
      direction: 'in',
      cursor: first.next?.cursor as string,
    })

    expect(first.links).toHaveLength(100)
    expect(first.indexing).toEqual({ done: 1, total: 3 })
    expect(second.links[0]?.from.line).toBe(101)
    expect(() =>
      paged.get_links({ node: 'Target', direction: 'out', cursor: first.next?.cursor as string }),
    ).toThrow('Cursor does not match')
  })

  it('waits for the first index', () => {
    const waiting = createLinkTools(() => ({ graph: null, progress: { done: 0, total: 9 } }))

    expect(() => waiting.find_nodes({ query: '' })).toThrow('still being indexed')
  })
})
