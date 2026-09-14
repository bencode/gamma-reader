import { type ComponentProps, isValidElement, useMemo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { imagePlaceholder } from '../core/document-text'
import { markdownPlugins, normalizeMath } from '../core/markdown-math'
import { MarkdownImage, type MarkdownImageContext } from './markdown-image'
import { MermaidDiagram } from './mermaid-diagram'

const CodeBlock = ({ children, ...props }: ComponentProps<'pre'>) => {
  if (
    isValidElement<{ className?: string; children?: string; 'data-diagram-closed'?: string }>(
      children,
    ) &&
    children.props.className === 'language-mermaid'
  ) {
    return (
      <MermaidDiagram
        source={(children.props.children ?? '').replace(/\n$/, '')}
        complete={children.props['data-diagram-closed'] === 'true'}
      />
    )
  }
  return <pre {...props}>{children}</pre>
}

type MarkdownVariant = 'reader' | 'chat'

const createComponents = (variant: MarkdownVariant, images?: MarkdownImageContext): Components => ({
  pre: ({ node: _node, ...props }) => <CodeBlock {...props} />,
  img: ({ alt, src }) => {
    const fallback = variant === 'chat' && !alt ? '[Image]' : imagePlaceholder(alt ?? undefined)
    if (!images || !src) return <span className="omitted-image">{fallback}</span>
    return <MarkdownImage alt={alt ?? undefined} context={images} fallback={fallback} src={src} />
  },
  a: ({ href, children }) => {
    const fragment = variant === 'reader' && href?.startsWith('#')
    return (
      <a
        href={fragment || /^https?:\/\//.test(href ?? '') ? href : undefined}
        target={fragment ? undefined : '_blank'}
        rel="noopener noreferrer"
      >
        {children}
      </a>
    )
  },
})

export const Markdown = ({
  text,
  variant,
  images,
}: {
  text: string
  variant: MarkdownVariant
  images?: MarkdownImageContext
}) => {
  const components = useMemo(() => createComponents(variant, images), [images, variant])
  return (
    <div className={`markdown-content markdown-${variant}`}>
      <ReactMarkdown
        remarkPlugins={markdownPlugins}
        rehypePlugins={[
          [rehypeKatex, { trust: false }],
          [rehypeHighlight, { detect: false, ignoreMissing: true, plainText: ['mermaid'] }],
        ]}
        skipHtml
        components={components}
      >
        {normalizeMath(text)}
      </ReactMarkdown>
    </div>
  )
}
