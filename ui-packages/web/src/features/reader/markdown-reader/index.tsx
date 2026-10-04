import { remarkLinks } from '@gamma-reader/links'
import { PanelLeft } from 'lucide-react'
import {
  type ComponentProps,
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ExtraProps } from 'react-markdown'
import { Markdown, type MarkdownExtensions } from '../../../components/markdown'
import { normalizeMath } from '../../../core/markdown-math'
import { useReaderBinding, useReveal } from '../../../shell/workspace-context'
import type { RevealTarget } from '../../../shell/workspace-store'
import { createMarkdownImageResolver } from '../markdown-image-resolver'
import { readViewport } from '../reader-viewport'
import type { TextReaderProps } from '../text-file-reader'
import { parseMarkdownHeadings } from './heading-model'
import { MarkdownOutline } from './outline'
import type { MarkdownReadingPreferences } from './reading-preferences'
import styles from './style.module.scss'
import { useFlowPosition } from './use-flow-position'
import { WikiLink } from './wiki-link'

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

// The rendered element a reveal names: a block by its name, a heading by its key.
const revealed = (article: HTMLElement, target: RevealTarget) => {
  const [attribute, value] =
    'block' in target
      ? ['block', target.block]
      : 'heading' in target
        ? ['heading', target.heading]
        : []
  if (!attribute) return undefined
  return [...article.querySelectorAll<HTMLElement>(`[data-${attribute}]`)].find(
    element => element.dataset[attribute] === value,
  )
}

// Links render as buttons that remarkLinks marks with what was written; any other button is kept.
const LinkButton = ({ node: _node, children, ...props }: ComponentProps<'button'> & ExtraProps) => {
  const data = props as Record<string, unknown>
  const raw = data['data-link']
  return typeof raw === 'string' ? (
    <WikiLink raw={raw} kind={String(data['data-kind'])}>
      {children}
    </WikiLink>
  ) : (
    <button type="button" {...props}>
      {children}
    </button>
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
}: TextReaderProps & { markdownOptions?: MarkdownExtensions; appearance?: MarkdownAppearance }) => {
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
  const extensions = useMemo<MarkdownExtensions>(
    () => ({
      components: { ...markdownOptions?.components, button: LinkButton },
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
    const elements = [...articleRef.current.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')]
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
            <Markdown text={content} variant="reader" images={images} {...extensions} />
          </article>
        </div>
      </div>
    </div>
  )
}
