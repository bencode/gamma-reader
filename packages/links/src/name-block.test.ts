import { describe, expect, it } from 'vitest'
import { nameBlock } from './name-block'
import { parseNote } from './parse'

const note = (...lines: string[]) => lines.join('\n')

// What changed: the lines that differ between two sources, as [line, before, after].
const changes = (before: string, after: string) => {
  const a = before.split('\n')
  const b = after.split('\n')
  return b.length === a.length
    ? b.flatMap((line, i) => (line === a[i] ? [] : [[i + 1, a[i], line]]))
    : { inserted: b.length - a.length }
}

const source = note(
  '# RAG',
  '',
  'Retrieval comes first: nothing recalled,',
  'nothing known.',
  '',
  '- Sparse retrieval with BM25',
  '  - Chinese needs segmentation',
  '',
  '## Methods',
  '',
  '| Method | Use |',
  '| --- | --- |',
  '| BM25 | exact |',
  '',
  'After the table.',
)

describe('naming a block', () => {
  it('names a paragraph at the end of its last line, quoted across lines', () => {
    const result = nameBlock(source, 'recalled, nothing known', 'retrieval-first')

    expect(result).toMatchObject({ name: 'retrieval-first', created: true })
    expect(changes(source, result.source)).toEqual([
      [4, 'nothing known.', 'nothing known. ^retrieval-first'],
    ])
    expect(nameBlock(source, 'RETRIEVAL COMES FIRST', 'retrieval-first').source).toBe(result.source)
    expect(parseNote(result.source).blocks).toEqual([
      expect.objectContaining({ name: 'retrieval-first', kind: 'paragraph', lines: [3, 4] }),
    ])
  })

  it('names a list item on its own line, so its children come with it', () => {
    const result = nameBlock(source, 'Sparse retrieval', 'sparse')

    expect(changes(source, result.source)).toEqual([
      [6, '- Sparse retrieval with BM25', '- Sparse retrieval with BM25 ^sparse'],
    ])
    expect(parseNote(result.source).blocks[0]).toMatchObject({ kind: 'item', lines: [6, 7] })
    expect(
      parseNote(nameBlock(source, 'needs segmentation', 'cjk').source).blocks[0],
    ).toMatchObject({ name: 'cjk', kind: 'item', lines: [7, 7] })
  })

  it('names a heading with its whole section', () => {
    const result = nameBlock(source, 'Methods', 'methods')

    expect(parseNote(result.source).blocks[0]).toMatchObject({
      kind: 'heading',
      lines: [9, 15],
    })
  })

  it('names a table on a line of its own, kept apart from the text after it', () => {
    const result = nameBlock(source, 'BM25 exact', 'method-table')

    expect(result.source.split('\n').slice(12, 17)).toEqual([
      '| BM25 | exact |',
      '',
      '^method-table',
      '',
      'After the table.',
    ])
    expect(changes(source, result.source)).toEqual({ inserted: 2 })
    expect(parseNote(result.source).blocks[0]).toMatchObject({ kind: 'other', lines: [11, 13] })
  })

  it('names a code block at its indentation, kept apart from the text right after it', () => {
    const nested = note('- Example', '', '  ```js', '  run()', '  ```')
    const followed = note('```js', 'stop()', '```', 'Then this.')

    expect(nameBlock(nested, 'run()', 'run').source.split('\n').slice(4)).toEqual([
      '  ```',
      '',
      '  ^run',
    ])
    expect(nameBlock(followed, 'stop()', 'stop').source.split('\n').slice(2)).toEqual([
      '```',
      '',
      '^stop',
      '',
      'Then this.',
    ])
    expect(parseNote(nameBlock(nested, 'run()', 'run').source).blocks.map(b => b.name)).toEqual([
      'run',
    ])
  })

  it('keeps a name the block already has, changing nothing', () => {
    const named = note('Retrieval first. ^def', '', '| omega |', '| - |', '', '^tbl')

    expect(nameBlock(named, 'Retrieval first', 'other')).toEqual({
      source: named,
      name: 'def',
      created: false,
    })
    expect(nameBlock(named, 'omega', 'other').name).toBe('tbl')
  })

  it('refuses an unusable name, a name in use, and a quote that is missing or ambiguous', () => {
    const twice = note('Alpha words.', '', 'Beta words.', '', 'Taken. ^used')

    expect(() => nameBlock(twice, 'Alpha', '检索')).toThrow('letters, digits and hyphens')
    expect(() => nameBlock(twice, 'Alpha', 'used')).toThrow('already names another block')
    expect(() => nameBlock(twice, 'Gamma', 'x')).toThrow('No passage holds that quote')
    expect(() => nameBlock(twice, 'words', 'x')).toThrow('2 passages hold that quote')
  })

  it('names a heading underlined with dashes on its text line, as a Logseq empty child makes', () => {
    // An empty child item under an item reads as a --- underline, making the item a heading.
    const logseq = note('- Work', '\t-', '- Learn')
    const result = nameBlock(logseq, 'Work', 'work')

    expect(result.source).toBe(note('- Work ^work', '\t-', '- Learn'))
    expect(parseNote(result.source).blocks[0]).toMatchObject({ name: 'work', kind: 'heading' })
  })

  it('will not name an outline that Markdown reads as indented code', () => {
    // As in a Logseq page whose blocks sit tab-indented under a heading.
    const outline = note(
      '## Plan',
      '\t- **EasyOCR** - simple to install',
      '\t- **Tesseract** - precise',
    )

    expect(() => nameBlock(outline, 'EasyOCR', 'easyocr')).toThrow('indented code block')
  })

  it('keeps line endings and frontmatter as they were', () => {
    const windows = note('---', 'name: RAG', '---', 'Text here.').replace(/\n/g, '\r\n')

    expect(nameBlock(windows, 'Text here', 'text').source).toBe(
      '---\r\nname: RAG\r\n---\r\nText here. ^text',
    )
  })
})
