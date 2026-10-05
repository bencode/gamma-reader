import { remarkLinks } from '@gamma-reader/links'
import { PanelLeft } from 'lucide-react'
import { type ReactNode, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Markdown, type MarkdownExtensions } from '../../../components/markdown'
import { normalizeMath } from '../../../core/markdown-math'
import { useLinkGraph, useReaderBinding, useReveal } from '../../../shell/workspace-context'
import type { RevealTarget } from '../../../shell/workspace-store'
import { createMarkdownImageResolver } from '../markdown-image-resolver'
import { readViewport } from '../reader-viewport'
import type { TextReaderProps } from '../text-file-reader'
import { Backlinks } from './backlinks'
import { EmbedScopeContext, placeKey } from './embed-context'
import { useEmbedResize } from './embed-resize'
import { parseMarkdownHeadings } from './heading-model'
import { linkComponents } from './link-components'
import { MarkdownOutline } from './outline'
import type { MarkdownReadingPreferences } from './reading-preferences'
import styles from './style.module.scss'
import { useFlowPosition } from './use-flow-position'

const embeddedOutlineMinimumWidth = 640

type MarkdownAppearance = {
  preferences: MarkdownReadingPreferences
  controls: ReactNode
}

const activeHeadingFrom = (elements: readonly HTMLElement[], scroll: HTMLElement) => {
  const threshold = scroll.getBoundingClientRect().top + 24
  return (
    elements.findLast(element => element.getBoundingClientRect().top <= threshold)?.id ??
    elements[0]?.id ??
    null
  )
}

// Elements of this note, not of the notes it embeds, which keep their own headings and names. An
// embed is this note's own, so it can be named; only what it shows belongs to another note.
const ownElements = (article: HTMLElement, selector: string) =>
  [...article.querySelectorAll<HTMLElement>(selector)].filter(
    element => !element.parentElement?.closest('[data-embed]'),
  )

// The rendered element a reveal names: a block by its name, a heading by its key.
const revealed = (article: HTMLElement, target: RevealTarget) => {
  const [attribute, value] =
    'block' in target
      ? ['block', target.block]
      : 'heading' in target
        ? ['heading', target.heading]
        : []
  if (!attribute) return undefined
  return ownElements(article, `[data-${attribute}]`).find(
    element => element.dataset[attribute] === value,
  )
}

export const MarkdownReader = ({
  document,
  content,
  files,
  active,
  defaultPosition,
  onPositionChange,
  imageResolver,
  markdownOptions,
  appearance,
  controls,
}: TextReaderProps & {
  markdownOptions?: MarkdownExtensions
  appearance?: MarkdownAppearance
  // Controls a reader built on this one adds to the toolbar, such as a Lab's Add cell.
  controls?: ReactNode
}) => {
  const markdown = document.previewKind === 'markdown' || document.previewKind === 'docx'
  const rootRef = useRef<HTMLDivElement>(null)
  const previewScrollRef = useRef<HTMLDivElement>(null)
  const articleRef = useRef<HTMLElement>(null)
  const headingElements = useRef<HTMLElement[]>([])
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [readerWidth, setReaderWidth] = useState(0)
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null)

  const headings = useMemo(
    () => (markdown ? parseMarkdownHeadings(normalizeMath(content)) : []),
    [content, markdown],
  )
  const images = useMemo(
    () => ({
      basePath: document.path,
      resolve: imageResolver ?? createMarkdownImageResolver(files),
    }),
    [document, files, imageResolver],
  )
  // The page this note is, as links name it, once the library is indexed.
  const page = useLinkGraph()?.page(document.id)
  // The note being read is the first place an embed chain holds, so it cannot embed itself. Its
  // embeds can be resized when it is a Markdown file of its own, not a converted document.
  const resize = useEmbedResize(document.id)
  const resizable = document.previewKind === 'markdown' && !imageResolver
  const embedScope = useMemo(
    () => ({
      chain: [placeKey(document.id, {})],
      depth: 0,
      files,
      components: linkComponents,
      ...(resizable ? { resize } : {}),
    }),
    [document.id, files, resizable, resize],
  )
  const extensions = useMemo<MarkdownExtensions>(
    () => ({
      components: { ...markdownOptions?.components, ...linkComponents },
      remarkPlugins: [...(markdownOptions?.remarkPlugins ?? []), remarkLinks],
    }),
    [markdownOptions],
  )
  const closeOutline = useCallback(() => setOutlineOpen(false), [])
  const binding = useMemo(
    () => ({
      fileId: document.id,
      getViewport: () => readViewport(articleRef.current, previewScrollRef.current),
    }),
    [document.id],
  )
  useReaderBinding(binding, active)

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || !markdown) return
    const measure = () => setReaderWidth(root.clientWidth)
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    measure()
    return () => observer.disconnect()
  }, [markdown])

  const position = useFlowPosition({
    rootRef,
    scrollRef: previewScrollRef,
    contentRef: articleRef,
    active,
    defaultPosition,
    onPositionChange,
  })

  // A link that led here asked for a place in this note; it is shown once the note is on screen.
  const { reveal, shown } = useReveal(document.id)
  useLayoutEffect(() => {
    const article = articleRef.current
    if (!reveal || !active || !article) return
    const element = revealed(article, reveal.target)
    if (element) position.show(element)
    shown(reveal)
  }, [active, position, reveal, shown])

  useLayoutEffect(() => {
    if (!markdown || !articleRef.current || !previewScrollRef.current) return
    const elements = ownElements(articleRef.current, 'h1, h2, h3, h4, h5, h6')
    elements.forEach((element, index) => {
      const heading = headings[index]
      if (heading) element.id = heading.id
    })
    headingElements.current = elements
    setActiveHeadingId(activeHeadingFrom(elements, previewScrollRef.current))
  }, [headings, markdown])

  if (!markdown)
    return (
      <div className="reader-content" ref={rootRef}>
        <div className="document-scroll" ref={previewScrollRef} onScroll={position.record}>
          <article className="markdown-body plain-text-body" ref={articleRef}>
            <pre>{content}</pre>
          </article>
        </div>
      </div>
    )

  const outlineLayout = readerWidth >= embeddedOutlineMinimumWidth ? 'embedded' : 'overlay'
  const outlineVisible = outlineOpen && headings.length > 0
  const navigateToHeading = (id: string) => {
    const target = headingElements.current.find(element => element.id === id)
    target?.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    })
    setActiveHeadingId(id)
    if (outlineLayout === 'overlay') setOutlineOpen(false)
  }

  return (
    <div
      className={`reader-content ${styles.reader}`}
      ref={rootRef}
      data-outline-layout={outlineLayout}
      data-outline-open={outlineVisible}
    >
      <div
        className={`preview-toolbar ${styles.toolbar} ${headings.length ? styles.toolbarWithOutline : ''}`}
        role="toolbar"
        aria-label="Markdown controls"
      >
        {headings.length > 0 && (
          <button
            type="button"
            className={
              outlineVisible
                ? `icon-button ${styles.outlineToggle} ${styles.activeControl}`
                : `icon-button ${styles.outlineToggle}`
            }
            aria-label={outlineVisible ? 'Hide table of contents' : 'Show table of contents'}
            aria-pressed={outlineVisible}
            title={outlineVisible ? 'Hide table of contents' : 'Show table of contents'}
            onClick={() => setOutlineOpen(open => !open)}
          >
            <PanelLeft size={16} />
          </button>
        )}
        {appearance?.controls}
        {controls}
      </div>
      <div className={styles.stage}>
        {outlineVisible && (
          <MarkdownOutline
            headings={headings}
            activeId={activeHeadingId}
            onNavigate={navigateToHeading}
            onClose={closeOutline}
          />
        )}
        <div
          className={`document-scroll ${styles.previewScroll}`}
          data-reading-theme={appearance?.preferences.theme}
          ref={previewScrollRef}
          onScroll={event => {
            if (!active) return
            position.record()
            setActiveHeadingId(activeHeadingFrom(headingElements.current, event.currentTarget))
          }}
        >
          <article
            className={`markdown-body ${styles.article} ${appearance ? styles.configuredArticle : ''}`}
            data-reading-width={appearance?.preferences.width}
            ref={articleRef}
            style={
              appearance
                ? {
                    fontSize: `${appearance.preferences.fontSize}px`,
                    maxWidth: appearance.preferences.width === 'focused' ? '74ch' : 'none',
                  }
                : undefined
            }
          >
            <EmbedScopeContext.Provider value={embedScope}>
              <Markdown text={content} variant="reader" images={images} {...extensions} />
            </EmbedScopeContext.Provider>
            {page !== undefined && <Backlinks page={page} exclude={document.id} />}
          </article>
        </div>
      </div>
    </div>
  )
}
