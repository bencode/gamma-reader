import katex from 'katex'
import 'katex/dist/katex.min.css'
import { useMemo } from 'react'

type LatexOutputProps = {
  latex: string
}

export const LatexOutput = ({ latex }: LatexOutputProps) => {
  const html = useMemo(
    () => katex.renderToString(latex, { displayMode: true, throwOnError: false }),
    [latex],
  )
  // biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX markup; its default trust: false rejects \href and \html* commands
  return <div dangerouslySetInnerHTML={{ __html: html }} />
}
