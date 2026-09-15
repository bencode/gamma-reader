import { useEffect, useMemo, useState } from 'react'

export const MermaidDiagram = ({ source, complete }: { source: string; complete: boolean }) => {
  const [rendered, setRendered] = useState<{ source: string; svg: string } | null>(null)
  useEffect(() => {
    if (!complete) return
    let cancelled = false
    const draw = async () => {
      const container = document.createElement('div')
      container.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;'
      try {
        const { default: mermaid } = await import('mermaid')
        if (cancelled) return
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          htmlLabels: false,
          suppressErrorRendering: true,
          theme: 'neutral',
          layout: 'dagre',
          fontFamily: 'system-ui, sans-serif',
        })
        document.body.append(container)
        const result = await mermaid.render(`diagram-${crypto.randomUUID()}`, source, container)
        if (!cancelled) setRendered({ source, svg: result.svg })
      } catch (error) {
        if (!cancelled) console.warn('Unable to render Mermaid diagram', error)
      } finally {
        container.remove()
      }
    }
    void draw()
    return () => {
      cancelled = true
    }
  }, [source, complete])

  const width = useMemo(() => {
    if (!rendered) return undefined
    const svg = new DOMParser().parseFromString(rendered.svg, 'image/svg+xml').documentElement
    const value = Number(svg.getAttribute('viewBox')?.split(/[\s,]+/)[2])
    return Number.isFinite(value) && value > 0 ? value : undefined
  }, [rendered])

  return (
    <div className="mermaid-diagram" data-diagram-source={source}>
      {complete && rendered?.source === source ? (
        <img
          alt="Mermaid diagram"
          width={width}
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(rendered.svg)}`}
        />
      ) : (
        <pre>
          <code>{source}</code>
        </pre>
      )}
    </div>
  )
}
