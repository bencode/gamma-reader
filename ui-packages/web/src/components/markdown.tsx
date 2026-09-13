import { type ComponentProps, isValidElement } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { imagePlaceholder } from '../core/document-text'
import { markdownPlugins, normalizeMath } from '../core/markdown-math'
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

const createComponents = (variant: MarkdownVariant): Components => ({
  pre: ({ node: _node, ...props }) => <CodeBlock {...props} />,
  img: ({ alt }) => (
    <span className="omitted-image">
      {variant === 'chat' && !alt ? '[Image]' : imagePlaceholder(alt)}
    </span>
  ),
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

const components = { reader: createComponents('reader'), chat: createComponents('chat') }

export const Markdown = ({ text, variant }: { text: string; variant: MarkdownVariant }) => (
  <div className={`markdown-content markdown-${variant}`}>
    <ReactMarkdown
      remarkPlugins={markdownPlugins}
      rehypePlugins={[
        [rehypeKatex, { trust: false }],
        [rehypeHighlight, { detect: false, ignoreMissing: true, plainText: ['mermaid'] }],
      ]}
      skipHtml
      components={components[variant]}
    >
      {normalizeMath(text)}
    </ReactMarkdown>
  </div>
)
