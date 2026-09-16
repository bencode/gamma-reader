import type { CodeLabCell, CodeLabLanguage } from '@gamma-reader/code-lab'
import type { Code, Root, RootContent } from 'mdast'
import { nanoid } from 'nanoid'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath)
const languages = new Set<string>(['scheme', 'clojure', 'python', 'typescript'])

type Fence = {
  start: number
  end: number
  openingEnd: number
  closingStart: number
  indent: string
  marker: string
  closingMarker: string
  eol: string
}

export type LabBlock = {
  offset: number
  id: string | null
  language: CodeLabLanguage | null
  source: string
  error: string | null
  fence: Fence | null
}

export type LabDocument = {
  source: string
  blocks: readonly LabBlock[]
  cells: readonly CodeLabCell[]
}

const readFence = (source: string, node: Code): Fence | null => {
  const offset = node.position?.start.offset
  const end = node.position?.end.offset
  if (offset === undefined || end === undefined) return null
  const start = source.lastIndexOf('\n', offset - 1) + 1
  const newline = source.indexOf('\n', offset)
  if (newline < 0 || newline >= end) return null
  const eol = source[newline - 1] === '\r' ? '\r\n' : '\n'
  const openingEnd = newline - (eol.length - 1)
  const opening = source.slice(start, openingEnd).match(/^( {0,3})(`{3,}|~{3,})/)
  if (!opening) return null
  const closingStart = source.lastIndexOf('\n', end - 1) + 1
  const closingMarker = source.slice(closingStart, end).trim()
  const marker = opening[2] ?? ''
  if (
    closingStart <= newline ||
    !/^ {0,3}(`+|~+)[ \t]*\r?$/.test(source.slice(closingStart, end)) ||
    closingMarker.length < marker.length ||
    [...closingMarker].some(char => char !== marker[0])
  )
    return null
  return {
    start,
    end,
    openingEnd,
    closingStart,
    indent: opening[1] ?? '',
    marker,
    closingMarker,
    eol,
  }
}

const readBlock = (source: string, node: Code, topLevel: boolean): LabBlock | null => {
  const tokens = node.meta?.split(/\s+/).filter(Boolean) ?? []
  if (!tokens.includes('run')) return null
  const ids = tokens.filter(token => token === 'id' || token.startsWith('id='))
  const id = ids[0]?.slice(3) ?? null
  const language = languages.has(node.lang ?? '') ? (node.lang as CodeLabLanguage) : null
  const fence = readFence(source, node)
  const error = !topLevel
    ? 'Move this runnable block outside lists and blockquotes.'
    : !language
      ? 'Supported languages: scheme, clojure, python, typescript.'
      : !fence
        ? 'Close the code fence to enable this cell.'
        : ids.length > 1 || (id !== null && !/^[A-Za-z0-9_-]+$/.test(id))
          ? 'Use one non-empty id containing letters, numbers, underscores or hyphens.'
          : null
  return {
    offset: node.position?.start.offset ?? 0,
    id,
    language,
    source: node.value.replace(/\r\n?/g, '\n'),
    error,
    fence,
  }
}

export const parseLabDocument = (source: string): LabDocument => {
  const collect = (node: Root | RootContent, topLevel: boolean): LabBlock[] => {
    if (node.type === 'code') {
      const block = readBlock(source, node, topLevel)
      return block ? [block] : []
    }
    return 'children' in node
      ? node.children.flatMap(child => collect(child, node.type === 'root'))
      : []
  }
  const found = collect(parser.parse(source), false)
  const counts = new Map<string, number>()
  found.forEach(block => {
    if (block.id) counts.set(block.id, (counts.get(block.id) ?? 0) + 1)
  })
  const blocks = found.map(block =>
    !block.error && block.id && (counts.get(block.id) ?? 0) > 1
      ? { ...block, error: `Duplicate cell id: ${block.id}. Give each cell a different id.` }
      : block,
  )
  const cells = blocks.flatMap(block =>
    !block.error && block.id && block.language
      ? [{ id: block.id, language: block.language, source: block.source }]
      : [],
  )
  return { source, blocks, cells }
}

export const ensureLabCellIds = (source: string): string => {
  const model = parseLabDocument(source)
  const ids = new Set(model.blocks.flatMap(block => (block.id ? [block.id] : [])))
  return [...model.blocks].reverse().reduce((next, block) => {
    if (block.id !== null || block.error || !block.fence) return next
    let id = nanoid(8)
    while (ids.has(id)) id = nanoid(8)
    ids.add(id)
    const offset = block.fence.openingEnd
    return `${next.slice(0, offset)} id=${id}${next.slice(offset)}`
  }, source)
}

export const replaceLabCell = (source: string, cellId: string, code: string): string => {
  const matches = parseLabDocument(source).blocks.filter(block => block.id === cellId)
  const block = matches[0]
  if (matches.length !== 1 || !block?.fence || block.error)
    throw new Error('This cell changed or is no longer available. Check its source before editing.')
  if (block.source === code) return source
  const { start, end, openingEnd, closingStart, marker, closingMarker, indent, eol } = block.fence
  const normalized = code.replace(/\r\n?/g, '\n')
  const longest = normalized.split('\n').reduce((length, line) => {
    const closing = line.match(/^ {0,3}(`+|~+)[ \t]*$/)?.[1]
    return closing && closing[0] === marker[0] ? Math.max(length, closing.length) : length
  }, 0)
  const length = Math.max(marker.length, longest + 1)
  const opening = source
    .slice(start, openingEnd)
    .replace(marker, marker[0]?.repeat(length) ?? marker)
  const closing = source
    .slice(closingStart, end)
    .replace(
      closingMarker,
      marker[0]?.repeat(Math.max(length, closingMarker.length)) ?? closingMarker,
    )
  const body = normalized
    ? `${normalized
        .split('\n')
        .map(line => indent + line)
        .join(eol)}${eol}`
    : ''
  return source.slice(0, start) + opening + eol + body + closing + source.slice(end)
}
