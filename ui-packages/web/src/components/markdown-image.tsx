import { useCallback, useEffect, useRef, useState } from 'react'

export type MarkdownImageResolver = (reference: string, basePath: string) => Promise<Blob | null>

export type MarkdownImageContext = {
  basePath: string
  resolve: MarkdownImageResolver
}

type MarkdownImageProps = {
  alt?: string
  context: MarkdownImageContext
  fallback: string
  src: string
}

type ImageState =
  | { status: 'loading' }
  | { status: 'ready'; context: MarkdownImageContext; source: string; url: string }
  | { status: 'missing' }

const fragmentOf = (reference: string) => {
  const hash = reference.indexOf('#')
  return hash === -1 ? '' : reference.slice(hash)
}

export const MarkdownImage = ({ alt, context, fallback, src }: MarkdownImageProps) => {
  const [state, setState] = useState<ImageState>({ status: 'loading' })
  const objectUrlRef = useRef<string | null>(null)
  const releaseObjectUrl = useCallback(() => {
    if (!objectUrlRef.current) return
    URL.revokeObjectURL(objectUrlRef.current)
    objectUrlRef.current = null
  }, [])

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    void context.resolve(src, context.basePath).then(
      blob => {
        if (!active || !blob) {
          if (active) setState({ status: 'missing' })
          return
        }
        const objectUrl = URL.createObjectURL(blob)
        objectUrlRef.current = objectUrl
        setState({
          status: 'ready',
          context,
          source: src,
          url: `${objectUrl}${fragmentOf(src)}`,
        })
      },
      error => {
        if (!active) return
        console.error(`Unable to load Markdown image: ${src}`, error)
        setState({ status: 'missing' })
      },
    )
    return () => {
      active = false
      releaseObjectUrl()
    }
  }, [context, releaseObjectUrl, src])

  if (state.status !== 'ready' || state.context !== context || state.source !== src) {
    return <span className="omitted-image">{fallback}</span>
  }
  return (
    <img
      className="markdown-local-image"
      src={state.url}
      alt={alt ?? ''}
      loading="lazy"
      decoding="async"
      onError={() => {
        releaseObjectUrl()
        setState({ status: 'missing' })
      }}
    />
  )
}
