import katex from 'katex'
import 'katex/dist/katex.min.css'
import { useEffect, useRef } from 'react'

type LatexOutputProps = {
  latex: string
}

export const LatexOutput = ({ latex }: LatexOutputProps) => {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    katex.render(latex, root, { displayMode: true, throwOnError: false })
  }, [latex])

  return <div ref={rootRef} />
}
