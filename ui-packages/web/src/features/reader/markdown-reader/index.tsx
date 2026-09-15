import { PanelLeft } from 'lucide-react'
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Markdown } from '../../../components/markdown'
import { normalizeMath } from '../../../core/markdown-math'
import { useReaderBinding } from '../../../shell/workspace-context'
import { createMarkdownImageResolver, workspacePathFor } from '../markdown-image-resolver'
import { readViewport } from '../reader-viewport'
import type { TextReaderProps } from '../text-file-reader'
import { parseMarkdownHeadings } from './heading-model'
import { MarkdownOutline } from './outline'
import styles from './style.module.scss'

const embeddedOutlineMinimumWidth = 640

const activeHeadingFrom = (elements: readonly HTMLElement[], scroll: HTMLElement) => {
  const threshold = scroll.getBoundingClientRect().top + 24
  return (
    elements.findLast(element => element.getBoundingClientRect().top <= threshold)?.id ??
    elements[0]?.id ??
    null
  )
}

export const MarkdownReader = ({
  document,
  content,
  files,
  active,
  scrollPositions,
}: TextReaderProps) => {
  const markdown = document.previewKind === 'markdown'
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
    () => ({ basePath: workspacePathFor(document), resolve: createMarkdownImageResolver(files) }),
    [document, files],
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

  useLayoutEffect(() => {
    if (!active || !previewScrollRef.current) return
    previewScrollRef.current.scrollTop = scrollPositions.current.get(document.id) ?? 0
  }, [active, document.id, scrollPositions])

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
      <div className="reader-content">
        <div
          className="document-scroll"
          ref={previewScrollRef}
          onScroll={event => {
            if (active) scrollPositions.current.set(document.id, event.currentTarget.scrollTop)
          }}
        >
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
          ref={previewScrollRef}
          onScroll={event => {
            if (!active) return
            scrollPositions.current.set(document.id, event.currentTarget.scrollTop)
            setActiveHeadingId(activeHeadingFrom(headingElements.current, event.currentTarget))
          }}
        >
          <article className="markdown-body" ref={articleRef}>
            <Markdown text={content} variant="reader" images={images} />
          </article>
        </div>
      </div>
    </div>
  )
}
