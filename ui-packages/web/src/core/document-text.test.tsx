import { render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Markdown } from '../components/markdown'
import { importStoredFiles } from '../data/file-store'
import { readViewport } from '../features/reader/reader-viewport'
import { findTextMatches, markdownText, normalizeSearchText } from './document-text'
import { createLocalTools } from './local-tools'

describe('searchable document text', () => {
  it.each([
    [
      'Chinese formatting',
      '我们**认真阅读**，再看[原始材料](https://example.test)。',
      '认真阅读，再看原始材料',
    ],
    ['HTML tags', '阅读<b>这一段</b>内容。', '阅读这一段内容。'],
    ['empty image alt', '开始 ![](image.png) 结束', '[Image omitted]'],
    ['entities and escapes', 'A &amp; B and \\*literal\\*', 'A & B and *literal*'],
    [
      'line wrapping',
      'Read **carefully** and\nfollow [the evidence](https://example.test).',
      'read carefully and follow the evidence',
    ],
  ])('matches rendered text for %s', (_name, source, query) => {
    const html = renderToStaticMarkup(<Markdown variant="reader" text={source} />)
    const rendered = new DOMParser().parseFromString(html, 'text/html').body.textContent ?? ''
    const text = markdownText(source)
    expect(normalizeSearchText(text)).toBe(normalizeSearchText(rendered))
    const matches = [...findTextMatches(text, normalizeSearchText(query))]
    expect(matches).toHaveLength(1)
    const match = matches[0]
    if (!match) throw new Error('Expected a search match')
    expect(
      normalizeSearchText(
        text
          .split('\n')
          .slice(match.start - 1, match.end)
          .join('\n'),
      ),
    ).toContain(normalizeSearchText(query))
  })

  it('keeps footnotes in display order and preserves table and code content', () => {
    const source =
      '前文。[^a]\n\n[^a]: 脚注内容。\n\n后文。\n\n| 名称 | 说明 |\n| --- | --- |\n| **甲** | 第一个选项 |\n\n```js\n  const value = "**literal**"\n```'
    const text = markdownText(source)
    expect(text.indexOf('脚注内容')).toBeGreaterThan(text.indexOf('后文'))
    expect(text).not.toContain('↩')
    expect([...findTextMatches(text, '甲 第一个选项')]).toHaveLength(1)
    expect(text).toContain('  const value = "**literal**"')
    expect([...findTextMatches(text, '前文。 后文。')]).toHaveLength(1)
  })

  it('groups repeated words by readable range, retaining separate paragraphs', () => {
    const text = '相同文字，中间还是相同文字。\n\n另一个段落的相同文字。'
    expect([...findTextMatches(text, '相同文字')].map(match => [match.start, match.end])).toEqual([
      [1, 1],
      [3, 3],
    ])
  })
})

describe('formula and diagram source context', () => {
  it('keeps LaTeX and Mermaid source readable and searchable without rendered duplicates', () => {
    const source =
      'Before $x^2$ after.\n\n$$\\frac{a}{b}$$\n\n```mermaid\nflowchart LR\nA --> B\n```'
    const text = markdownText(source)
    expect(text).toContain('Before x^2 after.')
    expect(text.match(/\\frac/g)).toHaveLength(1)
    expect(text).toContain('flowchart LR\nA --> B')
    expect([...findTextMatches(text, normalizeSearchText('Before x^2 after.'))]).toHaveLength(1)
  })

  it('resolves viewport formula anchors through the public search and read tools', async () => {
    const source = 'Before $x^2$ after.\n\n$$\\frac{a}{b}$$'
    const imported = await importStoredFiles([new File([source], 'formulas.md')], 'keep')
    const fileId = imported.addedIds[0]
    if (!fileId) throw new Error('Missing imported fixture')
    const { container } = render(<Markdown variant="reader" text={source} />)
    const rect = new DOMRect(100, 100, 500, 500)
    const rects = Object.assign([rect], { item: (index: number) => (index === 0 ? rect : null) })
    vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue(rects)
    const createRange = document.createRange.bind(document)
    vi.spyOn(document, 'createRange').mockImplementation(() => {
      const range = createRange()
      range.getClientRects = () => rects
      return range
    })
    const tools = createLocalTools(() => ({
      openFiles: [{ id: fileId, name: 'formulas.md' }],
      activeFile: { id: fileId, name: 'formulas.md' },
      viewport: readViewport(container, container),
    }))
    const viewport = tools.get_reader_state().viewport
    expect(viewport).toEqual({ startText: 'Before x^2 after.', endText: '\\frac{a}{b}' })
    for (const query of [viewport?.startText, viewport?.endText]) {
      if (!query) throw new Error('Missing anchor')
      const found = await tools.search({ query, fileId })
      expect(found.matches).toHaveLength(1)
      const range = found.matches[0]?.range
      const read = await tools.read({ fileId, range })
      expect(read.content).toContain(query)
    }
  })
})
