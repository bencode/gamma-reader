import {
  type EmbedSize,
  headingKey,
  isNotePath,
  type LinkTarget,
  parseNote,
  parseTarget,
  remarkLinks,
  splitFrontmatter,
  splitSize,
} from '@gamma-reader/links'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { Markdown } from '../../../components/markdown'
import { MarkdownImage } from '../../../components/markdown-image'
import type { StoredFileMetadata } from '../../../core/files'
import { getStoredFileContent } from '../../../data/file-store'
import { decodeUtf8 } from '../../../utils/text'
import { useLinkGraph, useOpenFile } from '../../workspace/workspace-context'
import { createMarkdownImageResolver } from '../markdown-image-resolver'
import { isP5SourceName } from '../p5-file'
import { type EmbedScope, EmbedScopeContext, placeKey, useEmbedScope } from './embed-context'
import { EmbeddedPage, EmbeddedSketch, ResizableBox } from './embed-frame'
import styles from './style.module.scss'
import { placeOf } from './wiki-link'

// Embeds written in the note being read show at once; those inside an embed wait to be opened,
// so a note that embeds many others costs only what the reader opens, and past this depth an
// embed is only a link.
const maximumDepth = 5
const embedPlugins = [remarkLinks]

// Lines indented as they were in the note, as a nested list item is, would read as code alone.
const dedent = (lines: readonly string[]) => {
  const indents = lines.filter(line => line.trim()).map(line => /^[ \t]*/.exec(line)?.[0] ?? '')
  const shared = indents.reduce((common, indent) => {
    let length = 0
    while (length < common.length && common[length] === indent[length]) length += 1
    return common.slice(0, length)
  }, indents[0] ?? '')
  return lines.map(line => line.slice(shared.length)).join('\n')
}

// A whole note shown in an embed, below its frontmatter and without a first heading that only
// repeats its name, which the embed already shows.
const wholeNote = (source: string, page: string) => {
  const lines = splitFrontmatter(source).body.split('\n')
  const [first] = parseNote(source).headings
  const at = first ? first.lines[0] - 1 : -1
  const repeated =
    first !== undefined &&
    headingKey(first.title) === headingKey(page) &&
    lines.slice(0, at).every(line => !line.trim())
  // A heading underlined with === or --- takes its underline with it.
  const underlined = /^\s*(=+|-+)\s*$/.test(lines[at + 1] ?? '')
  const dropped = new Set(repeated ? (underlined ? [at, at + 1] : [at]) : [])
  return lines.filter((_, index) => !dropped.has(index)).join('\n')
}

// What an embed shows of a note: all of it, or the lines of the block or section it names, as the
// index counts them; null when the note has no such block or section.
const partOf = (input: string, target: Pick<LinkTarget, 'block' | 'heading'>, page: string) => {
  const source = input.replace(/\r\n?/g, '\n')
  if (!target.block && !target.heading) return wholeNote(source, page)
  const note = parseNote(source)
  const wanted = headingKey(target.heading ?? '')
  const lines = target.block
    ? note.blocks.find(block => block.name === target.block)?.lines
    : note.headings.find(heading => headingKey(heading.title) === wanted)?.lines
  return lines ? dedent(source.split('\n').slice(lines[0] - 1, lines[1])) : null
}

type Part = { status: 'loading' } | { status: 'ready'; text: string } | { status: 'missing' }

// The note's saved text, read again when its metadata changes, as it does with each save. What
// was shown stays until the new text replaces it, so a save does not blank the embed for a moment.
const EmbeddedNote = ({
  file,
  target,
  page,
  scope,
  label,
}: {
  file: StoredFileMetadata
  target: LinkTarget
  page: string
  scope: EmbedScope
  label: string
}) => {
  const [part, setPart] = useState<Part>({ status: 'loading' })
  const { block, heading } = target
  useEffect(() => {
    let current = true
    getStoredFileContent(file.id)
      .then(async blob => {
        const text = blob ? decodeUtf8(await blob.arrayBuffer()) : null
        const shown = text === null ? null : partOf(text, { block, heading }, page)
        if (current)
          setPart(shown === null ? { status: 'missing' } : { status: 'ready', text: shown })
      })
      .catch((cause: unknown) => {
        console.error('Unable to read an embedded note', cause)
        if (current) setPart({ status: 'missing' })
      })
    return () => {
      current = false
    }
  }, [block, file, heading, page])

  const inner = useMemo<EmbedScope>(
    () => ({
      ...scope,
      resize: undefined,
      chain: [...scope.chain, placeKey(file.id, { block, heading })],
      depth: scope.depth + 1,
    }),
    [block, file.id, heading, scope],
  )
  const images = useMemo(
    () => ({ basePath: file.path, resolve: createMarkdownImageResolver(scope.files) }),
    [file.path, scope.files],
  )

  if (part.status === 'loading') return <p className={styles.embedNote}>Loading…</p>
  if (part.status === 'missing')
    return (
      <p className={styles.embedNote}>
        {block
          ? `${label} has no ^${block}.`
          : heading
            ? `${label} has no section ${heading}.`
            : `${label} could not be read.`}
      </p>
    )
  return (
    <EmbedScopeContext.Provider value={inner}>
      <Markdown
        text={part.text}
        variant="reader"
        images={images}
        components={scope.components}
        remarkPlugins={embedPlugins}
      />
    </EmbedScopeContext.Provider>
  )
}

// ![[...]] alone in its paragraph: the note, block or section it names, or the image, p5 sketch or
// HTML page, shown in place, carrying the paragraph's own name if it has one. Anything it cannot
// show — no single file, another kind of file, too deep — stays the link it holds, and a place
// already shown around it is named rather than shown again. An image, sketch or page takes the
// size written last in the embed, and a drag resizes it when the note it is written in allows.
export const WikiEmbed = ({
  raw,
  nth,
  block,
  children,
}: {
  raw: string
  nth: number
  block?: string
  children: ReactNode
}) => {
  const scope = useEmbedScope()
  const graph = useLinkGraph()
  const openFile = useOpenFile()
  const { raw: unsized, size } = splitSize(raw)
  const { target, label } = parseTarget(unsized)
  const resolution = graph?.resolve(target)
  const file =
    resolution?.kind === 'file'
      ? scope?.files.find(candidate => candidate.id === resolution.fileId)
      : undefined
  const depth = (scope?.depth ?? 0) + 1
  const [open, setOpen] = useState(depth === 1)
  // An image is read by its id; the same context while the file stays the same keeps it loaded.
  const fileId = file?.id
  const imageContext = useMemo(
    () => ({
      basePath: '',
      resolve: async () => (fileId ? getStoredFileContent(fileId) : null),
    }),
    [fileId],
  )

  const note = file && isNotePath(file.path)
  const image = file?.previewKind === 'image'
  const sketch = file && isP5SourceName(file.path)
  const page = file?.previewKind === 'html'
  // The link stays in the paragraph it was written as, keeping any name that paragraph has.
  if (!scope || !file || depth > maximumDepth || !(note || image || sketch || page))
    return <p data-block={block}>{children}</p>

  const name = label ?? (unsized.split('|')[0] ?? unsized).trim()
  const { resize } = scope
  const onResize = resize && ((next: EmbedSize) => resize(raw, nth, next))
  const title = (
    <button
      type="button"
      className={styles.embedTitle}
      title={file.path}
      onClick={() => openFile(file.id, placeOf(target))}
    >
      {name} ›
    </button>
  )
  const shown = (body: ReactNode) => (
    <aside className={styles.embed} data-embed={raw} data-block={block}>
      {title}
      {body}
    </aside>
  )

  if (image)
    return shown(
      <ResizableBox size={size} axis="width" className={styles.imageBox} onResize={onResize}>
        <MarkdownImage alt={name} context={imageContext} fallback={name} src={file.path} />
      </ResizableBox>,
    )
  if (sketch)
    return shown(<EmbeddedSketch file={file} name={name} size={size} onResize={onResize} />)
  if (page)
    return shown(
      <EmbeddedPage file={file} files={scope.files} name={name} size={size} onResize={onResize} />,
    )
  if (scope.chain.includes(placeKey(file.id, target)))
    return shown(
      <p className={styles.embedNote}>↻ Circular embed: {name} is already shown above.</p>,
    )
  if (!open)
    return shown(
      <button type="button" className={styles.embedExpand} onClick={() => setOpen(true)}>
        Expand
      </button>,
    )
  return shown(
    <EmbeddedNote
      file={file}
      target={target}
      page={graph?.page(file.id) ?? name}
      scope={scope}
      label={name}
    />,
  )
}
