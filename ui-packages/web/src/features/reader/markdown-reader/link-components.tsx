import type { ComponentProps } from 'react'
import type { Components, ExtraProps } from 'react-markdown'
import { WikiEmbed } from './wiki-embed'
import { WikiLink } from './wiki-link'

const dataOf = (props: object, key: string) => {
  const value = (props as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

// Links render as buttons that remarkLinks marks with what was written; any other button is kept.
const LinkButton = ({ node: _node, children, ...props }: ComponentProps<'button'> & ExtraProps) => {
  const raw = dataOf(props, 'data-link')
  return raw === undefined ? (
    <button type="button" {...props}>
      {children}
    </button>
  ) : (
    <WikiLink raw={raw} kind={dataOf(props, 'data-kind') ?? 'link'}>
      {children}
    </WikiLink>
  )
}

// An embed renders as an aside that remarkLinks marks; its child is the link to fall back on.
const EmbedAside = ({ node: _node, children, ...props }: ComponentProps<'aside'> & ExtraProps) => {
  const raw = dataOf(props, 'data-embed')
  return raw === undefined ? (
    <aside {...props}>{children}</aside>
  ) : (
    <WikiEmbed
      raw={raw}
      nth={Number(dataOf(props, 'data-nth') ?? 0)}
      block={dataOf(props, 'data-block')}
    >
      {children}
    </WikiEmbed>
  )
}

// What links and embeds render with, in a note and in the notes it embeds.
export const linkComponents: Components = { button: LinkButton, aside: EmbedAside }
