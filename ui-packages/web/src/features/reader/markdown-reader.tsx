import { useLayoutEffect, useMemo, useRef } from 'react'
import { Markdown } from '../../components/markdown'
import type { StoredFileMetadata } from '../../core/files'
import type { Workspace } from '../../shell/use-workspace'
import { useReaderBinding } from '../../shell/workspace-context'
import { createMarkdownImageResolver, workspacePathFor } from './markdown-image-resolver'
import { readViewport } from './reader-viewport'

type MarkdownReaderProps = {
  document: StoredFileMetadata
  content: string
  files: readonly StoredFileMetadata[]
  markdown: boolean
  active: boolean
  scrollPositions: Workspace['scrollPositions']
}

export const MarkdownReader = ({
  document,
  content,
  files,
  markdown,
  active,
  scrollPositions,
}: MarkdownReaderProps) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const articleRef = useRef<HTMLElement>(null)
  useReaderBinding(
    { fileId: document.id, getViewport: () => readViewport(articleRef.current, scrollRef.current) },
    active,
  )

  useLayoutEffect(() => {
    if (active && scrollRef.current)
      scrollRef.current.scrollTop = scrollPositions.current.get(document.id) ?? 0
  }, [active, document.id, scrollPositions])

  const images = useMemo(
    () => ({ basePath: workspacePathFor(document), resolve: createMarkdownImageResolver(files) }),
    [document, files],
  )

  return (
    <div className="reader-content">
      <div
        className="document-scroll"
        ref={scrollRef}
        onScroll={event => {
          if (active) scrollPositions.current.set(document.id, event.currentTarget.scrollTop)
        }}
      >
        <article
          className={markdown ? 'markdown-body' : 'markdown-body plain-text-body'}
          ref={articleRef}
        >
          {markdown ? (
            <Markdown text={content} variant="reader" images={images} />
          ) : (
            <pre>{content}</pre>
          )}
        </article>
      </div>
    </div>
  )
}
