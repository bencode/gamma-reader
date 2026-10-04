import { type Edge, headingKey } from '@gamma-reader/links'
import { useMemo, useState } from 'react'
import { useLinkGraph, useOpenFile } from '../../../shell/workspace-context'
import type { RevealTarget } from '../../../shell/workspace-store'
import styles from './style.module.scss'

// A page linked from many places lists the first of them until the reader asks for the rest.
const firstShown = 50

// A link is shown where it stands: in the named block or section around it, else at the top.
const whereLinkStands = (edge: Edge): RevealTarget | null =>
  edge.from.block
    ? { block: edge.from.block }
    : edge.from.section
      ? { heading: headingKey(edge.from.section) }
      : null

// The line a link stands on, without the list marker before it or a block name after it.
const lineOf = (edge: Edge) =>
  edge.context.replace(/^(?:[-*+]|\d+[.)])\s+/, '').replace(/\s\^[A-Za-z0-9-]+$/, '')

// The links into this note from other notes, grouped by the note they stand in, from the index of
// saved notes. Links to a block or section of this note count, as they lead here too.
export const Backlinks = ({ fileId }: { fileId: string }) => {
  const graph = useLinkGraph()
  const openFile = useOpenFile()
  const [shownCount, setShownCount] = useState(firstShown)
  const page = graph?.page(fileId)
  const links = useMemo(
    () =>
      graph && page ? graph.edges({ page }, 'in').filter(edge => edge.from.fileId !== fileId) : [],
    [fileId, graph, page],
  )
  // A line that links here more than once is listed once.
  const lines = useMemo(() => {
    const seen = new Set<string>()
    return links.filter(edge => {
      const line = `${edge.from.fileId}:${edge.from.line}`
      if (seen.has(line)) return false
      seen.add(line)
      return true
    })
  }, [links])
  if (!links.length) return null

  const groups = lines.slice(0, shownCount).reduce((bySource, edge) => {
    const group = bySource.get(edge.from.fileId)
    if (group) group.push(edge)
    else bySource.set(edge.from.fileId, [edge])
    return bySource
  }, new Map<string, Edge[]>())
  return (
    <details className={styles.backlinks} open>
      <summary>
        {links.length === 1 ? '1 link to this note' : `${links.length} links to this note`}
      </summary>
      {[...groups.values()].map(edges => {
        const from = edges[0]?.from
        if (!from) return null
        return (
          <div key={from.fileId} className={styles.backlinkSource}>
            <button
              type="button"
              className={styles.backlinkPath}
              onClick={() => openFile(from.fileId, null)}
            >
              {from.path}
            </button>
            <ul>
              {edges.map(edge => (
                <li key={edge.from.line}>
                  <button
                    type="button"
                    onClick={() => openFile(edge.from.fileId, whereLinkStands(edge))}
                  >
                    {lineOf(edge)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
      {lines.length > shownCount && (
        <button
          type="button"
          className={styles.backlinksMore}
          onClick={() => setShownCount(lines.length)}
        >
          Show {lines.length - shownCount} more
        </button>
      )}
    </details>
  )
}
