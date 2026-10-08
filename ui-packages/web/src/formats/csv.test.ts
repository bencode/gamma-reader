import { describe, expect, it } from 'vitest'
import { isTabular, parseCsv } from './csv'

// A spreadsheet's UTF-8 export starts with a byte order mark, which is invisible in source.
const bom = String.fromCodePoint(0xfeff)

describe('csv', () => {
  it('reads quoted fields holding delimiters, line breaks, and quotes', () => {
    const text = `${bom}species,count,note\r\nWren,3,"sang ""early"", twice"\r\nRobin,5,"one line\nand another"\r\n`
    expect(parseCsv(text)).toEqual([
      ['species', 'count', 'note'],
      ['Wren', '3', 'sang "early", twice'],
      ['Robin', '5', 'one line\nand another'],
    ])
  })

  it('takes the delimiter from the first record', () => {
    expect(parseCsv('species;count\n"Wren, winter";3')).toEqual([
      ['species', 'count'],
      ['Wren, winter', '3'],
    ])
    expect(parseCsv('species\tcount\nWren\t3')).toEqual([
      ['species', 'count'],
      ['Wren', '3'],
    ])
  })

  it('keeps a damaged file readable and tells a list from a table', () => {
    expect(parseCsv('a,b\n"open,quote\nrest')).toEqual([['a', 'b'], ['open,quote\nrest']])
    expect(isTabular(parseCsv('first line\nsecond line\n'))).toBe(false)
    expect(isTabular(parseCsv(''))).toBe(false)
  })
})
