import { describe, expect, it } from 'vitest'
import { ensureLabCellIds, parseLabDocument, replaceLabCell } from './document-model'

const fence = (meta: string, body = 'print(1)', marker = '```') =>
  `${marker}python ${meta}\n${body}\n${marker}`

describe('Lab Markdown source', () => {
  it('fills only missing executable ids and leaves existing ids and other content intact', () => {
    const source = [
      '# Lab',
      fence('run id=existing'),
      fence('run'),
      fence(''),
      '```typescript run\n1 + 1\n```',
      '```python run\nunclosed',
    ].join('\n\n')
    const normalized = ensureLabCellIds(source)
    const model = parseLabDocument(normalized)
    expect(model.cells).toHaveLength(3)
    expect(model.cells[0]?.id).toBe('existing')
    expect(model.cells.slice(1).every(cell => /^[\w-]{8}$/.test(cell.id))).toBe(true)
    expect(new Set(model.cells.map(cell => cell.id)).size).toBe(3)
    expect(normalized).toContain(fence(''))
    expect(normalized).toContain(fence('run id=existing'))
    expect(normalized.endsWith('```python run\nunclosed')).toBe(true)
    expect(ensureLabCellIds(normalized)).toBe(normalized)
  })

  it('keeps invalid and ambiguous cells inert without silently changing explicit ids', () => {
    const source = [
      fence('run id=same'),
      fence('run id=same'),
      fence('run id='),
      fence('run id=one id=two'),
      '```ruby run\nputs 1\n```',
      '> ```python run\n> print(1)\n> ```',
      '- ```python run\n  print(1)\n  ```',
    ].join('\n\n')
    const model = parseLabDocument(source)
    expect(model.cells).toEqual([])
    expect(model.blocks).toHaveLength(7)
    expect(model.blocks.every(block => block.error)).toBe(true)
    expect(ensureLabCellIds(source)).toBe(source)
    expect(() => replaceLabCell(source, 'same', '2')).toThrow('changed')
  })

  it('replaces by id after movement without rewriting neighboring Markdown or formulas', () => {
    const original = fence('run id=target', 'print(1)')
    const prefix = '# Changed title\n\n\\[x^2\\]\n\n![Figure](./plot.svg)\n\n'
    const suffix = `\n\n${fence('run id=other')}\n`
    const source = prefix + original + suffix
    const next = replaceLabCell(source, 'target', 'print(2)\nprint(3)')
    expect(next).toBe(prefix + fence('run id=target', 'print(2)\nprint(3)') + suffix)
    expect(replaceLabCell(next, 'target', 'print(2)\nprint(3)')).toBe(next)
    expect(() => replaceLabCell(next, 'missing', 'lost')).toThrow('no longer available')
  })

  it.each(['\n', '\r\n'])(
    'preserves indentation and %j line endings, including empty and trailing lines',
    eol => {
      const original = '  ~~~python run\n  first\n  ~~~\nAfter'.replaceAll('\n', eol)
      const normalized = ensureLabCellIds(original)
      const id = parseLabDocument(normalized).cells[0]?.id
      if (!id) throw new Error('Expected a generated id')
      ;['', 'one\ntwo', 'one\n', '\n'].forEach(code => {
        const next = replaceLabCell(normalized, id, code)
        expect(parseLabDocument(next).cells[0]?.source).toBe(code)
        expect(next.endsWith(`${eol}After`)).toBe(true)
        if (eol === '\r\n') expect(next.replaceAll('\r\n', '')).not.toContain('\n')
      })
    },
  )

  it.each(['```', '~~~'])('extends %s fences when edited code contains a closing fence', marker => {
    const code = `before\n${marker}${marker}\nafter`
    const source = fence('run id=target', 'before', marker)
    const next = replaceLabCell(source, 'target', code)
    const model = parseLabDocument(next)
    expect(model.cells).toEqual([{ id: 'target', language: 'python', source: code }])
    expect(model.blocks[0]?.fence?.marker.length).toBe(7)
  })
})
