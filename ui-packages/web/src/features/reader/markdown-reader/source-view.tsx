import { markdown } from '@codemirror/lang-markdown'
import { forwardRef } from 'react'
import { CodeReader, type CodeReaderHandle } from '../../../components/code-reader'

export type MarkdownSourceViewHandle = CodeReaderHandle

const markdownExtensions = [markdown({ addKeymap: false, completeHTMLTags: false })] as const

export const MarkdownSourceView = forwardRef<
  MarkdownSourceViewHandle,
  {
    content: string
    name: string
    scrollPosition: { current: number }
  }
>(function MarkdownSourceView({ content, name, scrollPosition }, ref) {
  return (
    <CodeReader
      ref={ref}
      content={content}
      name={name}
      extensions={markdownExtensions}
      scrollPosition={scrollPosition}
    />
  )
})
