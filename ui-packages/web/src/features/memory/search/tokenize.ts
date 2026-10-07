import { normalizeSearchText } from '../../../core/document-text'

// The browser's word segmenter splits terms it does not know into single characters (闭包 into 闭
// and 包), so Han, kana and Hangul are indexed by overlapping pairs instead, as Lucene's CJK bigram
// filter does. A query for 尾递归 then shares 尾递 and 递归 with any entry that mentions it.
const cjkRun = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu

const bigrams = (run: string) => {
  const characters = Array.from(run)
  return characters.length === 1
    ? characters
    : characters.slice(1).map((character, index) => `${characters[index]}${character}`)
}

const words = new Intl.Segmenter(undefined, { granularity: 'word' })

const segmentWords = (text: string) =>
  Array.from(words.segment(text))
    .filter(segment => segment.isWordLike)
    .map(segment => normalizeSearchText(segment.segment))

export const tokenize = (text: string) => [
  ...Array.from(text.matchAll(cjkRun), match => match[0]).flatMap(bigrams),
  ...segmentWords(text.replace(cjkRun, ' ')),
]
