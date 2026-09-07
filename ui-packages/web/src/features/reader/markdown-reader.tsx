import { useLayoutEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { StoredFileMetadata } from '../../core/files'
import type { Workspace } from '../../shell/use-workspace'
import { ReaderSelectionAction, useReaderSelection } from './reader-selection'

type MarkdownReaderProps = {
  document: StoredFileMetadata
  content: string
  markdown: boolean
  active: boolean
  scrollPositions: Workspace['scrollPositions']
  onQuote: (documentId: string, text: string) => void
}

export const MarkdownReader = ({
  document,
  content,
  markdown,
  active,
  scrollPositions,
  onQuote,
}: MarkdownReaderProps) => {
  const rootRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const articleRef = useRef<HTMLElement>(null)
  const { selection, setSelection, captureSelection } = useReaderSelection({
    active,
    rootRef,
    boundaryRef: articleRef,
    resetKey: `${document.id}:${document.revision}`,
  })

  useLayoutEffect(() => {
    if (active && scrollRef.current)
      scrollRef.current.scrollTop = scrollPositions.current.get(document.id) ?? 0
  }, [active, document.id, scrollPositions])

  return (
    <div className="reader-content" ref={rootRef}>
      <div
        className="document-scroll"
        ref={scrollRef}
        onScroll={event => {
          if (active) scrollPositions.current.set(document.id, event.currentTarget.scrollTop)
          setSelection(null)
        }}
      >
        <article
          className={markdown ? 'markdown-body' : 'markdown-body plain-text-body'}
          ref={articleRef}
          onPointerUp={captureSelection}
          onKeyUp={captureSelection}
        >
          <div className="document-meta">
            <span>Read-only</span>
          </div>
          {markdown ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              skipHtml
              components={{
                img: ({ alt }) => (
                  <span className="omitted-image">
                    {alt ? `[Image: ${alt}]` : '[Image omitted]'}
                  </span>
                ),
                a: ({ href, children }) => (
                  <a
                    href={
                      href?.startsWith('#') || /^https?:\/\//.test(href ?? '') ? href : undefined
                    }
                    target={href?.startsWith('#') ? undefined : '_blank'}
                    rel="noopener noreferrer"
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          ) : (
            <pre>{content}</pre>
          )}
        </article>
      </div>
      {selection && active && (
        <ReaderSelectionAction
          selection={selection}
          onAsk={text => {
            onQuote(document.id, text)
            window.getSelection()?.removeAllRanges()
            setSelection(null)
          }}
        />
      )}
    </div>
  )
}
