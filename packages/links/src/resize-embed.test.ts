import { describe, expect, it } from 'vitest'
import { parseTarget, splitSize, textPieces } from './parse'
import { resizeEmbed } from './resize-embed'

describe('embed sizes', () => {
  it('reads a trailing width or width and height as a size, and leaves labels and links alone', () => {
    expect(splitSize('demo.html|800x500')).toEqual({
      raw: 'demo.html',
      size: { width: 800, height: 500 },
    })
    expect(splitSize('a.png|Diagram|600')).toEqual({ raw: 'a.png|Diagram', size: { width: 600 } })
    expect(splitSize('a.png|Diagram')).toEqual({ raw: 'a.png|Diagram' })
    expect(parseTarget(splitSize('a.png|Diagram|600').raw).label).toBe('Diagram')
    expect(textPieces('![[a.png|600]] [[Year|2024]]')).toMatchObject([
      { link: 'a.png|600', shown: 'a.png', embed: true },
      { text: ' ' },
      { link: 'Year|2024', shown: '2024', embed: false },
    ])
  })
})

describe('resizing an embed', () => {
  const source = [
    '![[s.p5.js]]',
    '',
    '`![[s.p5.js]]`',
    '',
    '```',
    '![[s.p5.js]]',
    '```',
    '',
    '- ![[s.p5.js]] ^two',
    '- ![[s.p5.js|Orbit|300]]',
  ].join('\r\n')

  it('sizes the embed the reader counted, skipping code and keeping names and labels', () => {
    expect(resizeEmbed(source, 's.p5.js', 1, { width: 640 })).toBe(
      source.replace('- ![[s.p5.js]] ^two', '- ![[s.p5.js|640]] ^two'),
    )
    expect(resizeEmbed(source, 's.p5.js|Orbit|300', 0, { width: 720, height: 480 })).toBe(
      source.replace('|Orbit|300', '|Orbit|720x480'),
    )
  })

  it('finds nothing when the embed is no longer there', () => {
    expect(resizeEmbed(source, 's.p5.js', 2, { width: 640 })).toBeNull()
  })
})
