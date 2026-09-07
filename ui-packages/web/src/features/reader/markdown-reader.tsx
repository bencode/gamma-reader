import { MessageSquarePlus } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { SampleDocument } from '../../core/samples'
import type { Workspace } from '../../shell/use-workspace'

type MarkdownReaderProps = {
  document: SampleDocument
  active: boolean
  scrollPositions: Workspace['scrollPositions']
  onQuote: (documentId: string, text: string) => void
}

type SelectedText = { text: string; left: number; top: number }

export const MarkdownReader = ({
  document: source,
  active,
  scrollPositions,
  onQuote,
}: MarkdownReaderProps) => {
  const rootRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const articleRef = useRef<HTMLElement>(null)
  const [selection, setSelection] = useState<SelectedText | null>(null)

  useLayoutEffect(() => {
    if (active && scrollRef.current)
      scrollRef.current.scrollTop = scrollPositions.current.get(source.id) ?? 0
  }, [active, source.id, scrollPositions])

  useEffect(() => {
    if (!active) setSelection(null)
  }, [active])

  const captureSelection = () => {
    const selected = window.getSelection()
    const article = articleRef.current
    const root = rootRef.current
    if (!selected?.rangeCount || !selected.toString().trim() || !article || !root) {
      setSelection(null)
      return
    }
    const range = selected.getRangeAt(0)
    if (!article.contains(range.startContainer) || !article.contains(range.endContainer)) {
      setSelection(null)
      return
    }
    const rect = range.getBoundingClientRect()
    const bounds = root.getBoundingClientRect()
    setSelection({
      text: selected.toString().trim(),
      left: Math.max(12, Math.min(rect.right - bounds.left - 100, bounds.width - 116)),
      top: Math.max(8, Math.min(rect.bottom - bounds.top + 8, bounds.height - 48)),
    })
  }

  return (
    <div className="reader-content" ref={rootRef}>
      <div
        className="document-scroll"
        ref={scrollRef}
        onScroll={event => {
          if (active) scrollPositions.current.set(source.id, event.currentTarget.scrollTop)
          setSelection(null)
        }}
      >
        <article
          className="markdown-body"
          ref={articleRef}
          onPointerUp={captureSelection}
          onKeyUp={captureSelection}
        >
          <div className="document-meta">
            <span>EXAMPLE DOCUMENT</span>
            <span>Read-only</span>
          </div>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            skipHtml
            components={{
              img: ({ alt }) => (
                <span className="omitted-image">{alt ? `[Image: ${alt}]` : '[Image omitted]'}</span>
              ),
              a: ({ href, children }) => (
                <a
                  href={href?.startsWith('#') || /^https?:\/\//.test(href ?? '') ? href : undefined}
                  target={href?.startsWith('#') ? undefined : '_blank'}
                  rel="noopener noreferrer"
                >
                  {children}
                </a>
              ),
            }}
          >
            {source.content}
          </ReactMarkdown>
        </article>
      </div>
      {selection && active && (
        <button
          className="selection-action"
          type="button"
          style={{ left: selection.left, top: selection.top }}
          onClick={() => {
            onQuote(source.id, selection.text)
            window.getSelection()?.removeAllRanges()
            setSelection(null)
          }}
        >
          <MessageSquarePlus size={15} /> Ask AI
        </button>
      )}
    </div>
  )
}
