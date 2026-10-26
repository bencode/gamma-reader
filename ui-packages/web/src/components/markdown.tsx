import {
  type ComponentProps,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useMemo,
} from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import type { PluggableList } from 'unified'
import 'katex/dist/katex.min.css'
import { markdownPlugins, normalizeMath } from '../formats/markdown-math'
import { imagePlaceholder } from '../formats/markdown-text'
import { markdownHighlightLanguages } from './markdown-highlight-languages'
import { MarkdownImage, type MarkdownImageContext } from './markdown-image'
import { MermaidDiagram } from './mermaid-diagram'

const rehypePlugins: PluggableList = [
  [rehypeKatex, { trust: false }],
  [
    rehypeHighlight,
    {
      detect: false,
      languages: markdownHighlightLanguages,
      plainText: ['mermaid', 'text', 'txt', 'plaintext'],
    },
  ],
]

export const MarkdownCodeBlock = ({ children, ...props }: ComponentProps<'pre'>) => {
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

export type MarkdownAnchorProps = {
  href?: string
  id?: string
  'aria-label'?: string
  children?: ReactNode
  variant: MarkdownVariant
}

export const MarkdownAnchor = ({
  href,
  id,
  'aria-label': label,
  children,
  variant,
}: MarkdownAnchorProps): ReactElement => {
  const fragment = variant === 'reader' && href?.startsWith('#')
  return (
    <a
      // A footnote links back to its reference by this id. Only the reader follows # links, and
      // chat messages would repeat the same footnote ids.
      id={variant === 'reader' ? id : undefined}
      // A footnote's back link is a bare arrow; its label says where it goes.
      aria-label={label}
      href={fragment || /^https?:\/\//.test(href ?? '') ? href : undefined}
      target={fragment ? undefined : '_blank'}
      rel="noopener noreferrer"
    >
      {children}
    </a>
  )
}

const createComponents = (variant: MarkdownVariant, images?: MarkdownImageContext): Components => ({
  pre: ({ node: _node, ...props }) => <MarkdownCodeBlock {...props} />,
  img: ({ alt, src }) => {
    const fallback = variant === 'chat' && !alt ? '[Image]' : imagePlaceholder(alt ?? undefined)
    if (!images || !src) return <span className="omitted-image">{fallback}</span>
    return <MarkdownImage alt={alt ?? undefined} context={images} fallback={fallback} src={src} />
  },
  a: ({ href, id, 'aria-label': label, children }) => (
    <MarkdownAnchor href={href} id={id} aria-label={label} variant={variant}>
      {children}
    </MarkdownAnchor>
  ),
})

export type MarkdownExtensions = {
  components?: Components
  remarkPlugins?: PluggableList
}

export const Markdown = ({
  text,
  variant,
  images,
  components: overrides,
  remarkPlugins,
}: MarkdownExtensions & {
  text: string
  variant: MarkdownVariant
  images?: MarkdownImageContext
}) => {
  const components = useMemo(
    () => ({ ...createComponents(variant, images), ...overrides }),
    [images, overrides, variant],
  )
  const plugins = useMemo(() => [...markdownPlugins, ...(remarkPlugins ?? [])], [remarkPlugins])
  return (
    <div className={`markdown-content markdown-${variant}`}>
      <ReactMarkdown
        remarkPlugins={plugins}
        rehypePlugins={rehypePlugins}
        skipHtml
        components={components}
      >
        {normalizeMath(text)}
      </ReactMarkdown>
    </div>
  )
}
