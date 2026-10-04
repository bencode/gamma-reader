import type { Element, Root as HastRoot, Nodes } from 'hast'
import type { Root } from 'mdast'
import { toHast } from 'mdast-util-to-hast'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { describe, expect, it } from 'vitest'
import { parseNote } from './parse'
import { remarkLinks } from './remark'

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkLinks)

// The elements a reader would render, as HTML-like text with only the attributes links add.
const kept = ['dataLink', 'dataKind', 'dataBlock', 'dataHeading']
const html = (node: Nodes): string => {
  if (node.type === 'text') return node.value
  if (node.type !== 'element' && node.type !== 'root') return ''
  const children = node.children.map(html).join('')
  if (node.type === 'root') return children.trim()
  const attributes = kept
    .filter(key => node.properties[key] !== undefined)
    .map(key => ` ${key}="${String(node.properties[key])}"`)
    .join('')
  return `<${node.tagName}${attributes}>${children}</${node.tagName}>`
}

const hastOf = (source: string) =>
  toHast(processor.runSync(processor.parse(source)) as Root) as HastRoot

const render = (...lines: string[]) => html(hastOf(lines.join('\n'))).replace(/\n/g, '')

const elements = (node: Nodes): Element[] =>
  node.type === 'element' || node.type === 'root'
    ? [...(node.type === 'element' ? [node] : []), ...node.children.flatMap(elements)]
    : []

describe('rendering links', () => {
  it('turns links, labels, tags, embeds and PDF pages into buttons that know their target', () => {
    expect(
      render('See [[RAG]], [[RAG#^def|定义]], #[[agents]], ![[RAG#Later]], [[p.pdf#page=3]].'),
    ).toBe(
      '<p>See <button dataLink="RAG" dataKind="link">RAG</button>, ' +
        '<button dataLink="RAG#^def|定义" dataKind="link">定义</button>, ' +
        '<button dataLink="agents" dataKind="tag">#agents</button>, ' +
        '<button dataLink="RAG#Later" dataKind="embed">RAG#Later</button>, ' +
        '<button dataLink="p.pdf#page=3" dataKind="link">p.pdf#page=3</button>.</p>',
    )
  })

  it('leaves code, inline code, Markdown links and links within the page alone', () => {
    expect(render('`[[A]]` [see [[B]]](https://x.org) [[#Local]]', '', '```', '[[C]]', '```')).toBe(
      '<p><code>[[A]]</code> <a>see [[B]]</a> [[#Local]]</p><pre><code>[[C]]\n</code></pre>'.replace(
        /\n/g,
        '',
      ),
    )
  })
})

describe('rendering names', () => {
  const source = [
    '## Methods ^methods',
    '',
    'Retrieval first. ^def',
    '',
    '- Sparse retrieval ^sparse',
    '  - with BM25',
    '',
    '| A |',
    '| - |',
    '| x |',
    '',
    '^table',
  ]

  it('hides each name and marks the element it names', () => {
    expect(render(...source)).toBe(
      '<h2 dataBlock="methods" dataHeading="methods">Methods</h2>' +
        '<p dataBlock="def">Retrieval first.</p>' +
        '<ul><li dataBlock="sparse">Sparse retrieval<ul><li>with BM25</li></ul></li></ul>' +
        '<table dataBlock="table"><thead><tr><th>A</th></tr></thead>' +
        '<tbody><tr><td>x</td></tr></tbody></table>',
    )
  })

  it('marks exactly the blocks the index knows by name', () => {
    const tree = hastOf(source.join('\n'))
    const marked = elements(tree).flatMap(element =>
      element.properties.dataBlock ? [String(element.properties.dataBlock)] : [],
    )

    expect(marked.sort()).toEqual(
      parseNote(source.join('\n'))
        .blocks.map(block => block.name)
        .sort(),
    )
  })

  it('gives headings the key a link to them uses', () => {
    expect(render('# Retrieval  Strategy', '', '## 检索 [[RAG]]')).toBe(
      '<h1 dataHeading="retrieval strategy">Retrieval  Strategy</h1>' +
        '<h2 dataHeading="检索 [[rag]]">检索 <button dataLink="RAG" dataKind="link">RAG</button></h2>',
    )
  })
})
