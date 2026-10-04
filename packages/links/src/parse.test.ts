import { describe, expect, it } from 'vitest'
import { parseNote, parseTarget } from './parse'

const note = (...lines: string[]) => parseNote(lines.join('\n'))

describe('link targets', () => {
  it('reads a page, a block, a heading, a PDF page and a label', () => {
    expect(parseTarget('RAG')).toEqual({ target: { page: 'RAG' } })
    expect(parseTarget('RAG#^retrieval-first')).toEqual({
      target: { page: 'RAG', block: 'retrieval-first' },
    })
    expect(parseTarget('RAG#检索策略')).toEqual({ target: { page: 'RAG', heading: '检索策略' } })
    expect(parseTarget('sutton.pdf#page=12')).toEqual({
      target: { page: 'sutton.pdf', pdfPage: 12 },
    })
    expect(parseTarget(' RAG #^def | 定义 ')).toEqual({
      target: { page: 'RAG', block: 'def' },
      label: '定义',
    })
  })
})

describe('links in a note', () => {
  it('finds links, embeds and tags with their line', () => {
    const { links } = note(
      '# Notes',
      '',
      'See [[RAG|retrieval]] and #[[agent]].',
      '',
      '![[RAG#^def]]',
    )

    expect(links).toEqual([
      {
        target: { page: 'RAG' },
        label: 'retrieval',
        embed: false,
        tag: false,
        line: 3,
        context: 'See [[RAG|retrieval]] and #[[agent]].',
      },
      {
        target: { page: 'agent' },
        embed: false,
        tag: true,
        line: 3,
        context: 'See [[RAG|retrieval]] and #[[agent]].',
      },
      {
        target: { page: 'RAG', block: 'def' },
        embed: true,
        tag: false,
        line: 5,
        context: '![[RAG#^def]]',
      },
    ])
  })

  it('leaves code, inline code and links within the same page alone', () => {
    const { links } = note(
      '```bash',
      '[[ -f [[file]] ]] && echo yes',
      '```',
      '',
      'Write `[[RAG]]` to link, or jump to [[#Below]].',
    )

    expect(links).toEqual([])
  })

  it('reads text that only looks like a link as one, as written', () => {
    expect(note('if [[ "$x" == y ]]; then').links.map(link => link.target.page)).toEqual([
      '"$x" == y',
    ])
  })

  it('counts lines within a paragraph that spans several, with several links to a line', () => {
    const { links } = note(
      'first line',
      'second [[B]] line',
      'third',
      '[[C]] and [[D]]',
      'last [[E]]',
    )

    expect(links.map(link => [link.target.page, link.line])).toEqual([
      ['B', 2],
      ['C', 4],
      ['D', 4],
      ['E', 5],
    ])
  })
})

describe('named blocks', () => {
  it('names a paragraph, a list item with its children, a heading section and a table', () => {
    const { blocks } = note(
      '# RAG',
      '',
      'Retrieval comes first: nothing recalled, nothing known. ^retrieval-first',
      '',
      '- Sparse retrieval with BM25 ^sparse',
      '  - Chinese needs word segmentation',
      '- Dense retrieval',
      '',
      '## Methods ^methods',
      '',
      '| Method | Use |',
      '| --- | --- |',
      '| BM25 | exact |',
      '',
      '^method-table',
      '',
      '## Later',
      'end',
    )

    expect(blocks).toEqual([
      {
        name: 'retrieval-first',
        kind: 'paragraph',
        lines: [3, 3],
        text: 'Retrieval comes first: nothing recalled, nothing known.',
      },
      { name: 'methods', kind: 'heading', lines: [9, 15], text: 'Methods' },
      { name: 'method-table', kind: 'other', lines: [11, 13], text: 'Method Use BM25 exact' },
      {
        name: 'sparse',
        kind: 'item',
        lines: [5, 6],
        text: 'Sparse retrieval with BM25',
      },
    ])
  })

  it('does not take a caret inside words or code for a name', () => {
    expect(note('x^2 grows', '', '`a ^b`').blocks).toEqual([])
  })
})

describe('headings and frontmatter', () => {
  it('gives each heading its section, up to the next at its level or above', () => {
    expect(note('# A', 'a', '## B', 'b', '', '# C', 'c').headings).toEqual([
      { title: 'A', level: 1, lines: [1, 4] },
      { title: 'B', level: 2, lines: [3, 4] },
      { title: 'C', level: 1, lines: [6, 7] },
    ])
  })

  it('ends a heading inside a list item with that item, as in a Logseq outline', () => {
    expect(note('- ## Reading', '\t- one', '- ## Plans', '\t- two', '- Learn').headings).toEqual([
      { title: 'Reading', level: 2, lines: [1, 2] },
      { title: 'Plans', level: 2, lines: [3, 4] },
    ])
  })

  it('reads a name from frontmatter and keeps line numbers', () => {
    const parsed = note('---', 'name: "RAG index"', 'tags: x', '---', '# Title', 'See [[B]]')

    expect(parsed.name).toBe('RAG index')
    expect(parsed.headings).toEqual([{ title: 'Title', level: 1, lines: [5, 6] }])
    expect(parsed.links[0]?.line).toBe(6)
  })
})
