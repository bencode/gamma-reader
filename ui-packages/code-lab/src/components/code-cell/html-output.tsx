import DOMPurify from 'dompurify'
import { useEffect, useRef } from 'react'

type HtmlOutputProps = {
  html: string
}

export const HtmlOutput = ({ html }: HtmlOutputProps) => {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const template = document.createElement('template')
    template.innerHTML = DOMPurify.sanitize(html)
    root.replaceChildren(template.content.cloneNode(true))
  }, [html])

  return <div ref={rootRef} />
}
