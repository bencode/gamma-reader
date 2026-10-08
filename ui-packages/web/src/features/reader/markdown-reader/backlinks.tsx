import { type Edge, headingKey, pageKey, textPieces } from '@gamma-reader/links'
import { Fragment, useMemo, useState } from 'react'
import { useLinkGraph, useOpenFile } from '../../workspace/workspace-context'
import type { RevealTarget } from '../../workspace/workspace-store'
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

// The line a link stands on as it reads, without the list marker before it or a block name after
// it, and with links shown as their text; those that lead here stand out.
const LinkLine = ({ edge, page }: { edge: Edge; page: string }) => {
  const line = edge.context.replace(/^(?:[-*+]|\d+[.)])\s+/, '').replace(/\s\^[A-Za-z0-9-]+$/, '')
  return textPieces(line).map((piece, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: the pieces of one line never reorder
    <Fragment key={index}>
      {'text' in piece ? (
        piece.text
      ) : pageKey(piece.target.page) === pageKey(page) ? (
        <strong>{piece.shown}</strong>
      ) : (
        piece.shown
      )}
    </Fragment>
  ))
}

// The links into a page from notes, grouped by the note they stand in, from the index of saved
// notes; for a note, its own links to itself are left out. Links to a block or section of the
// page count, as they lead there too.
export const Backlinks = ({ page, exclude }: { page: string; exclude?: string }) => {
  const graph = useLinkGraph()
  const openFile = useOpenFile()
  const [shownCount, setShownCount] = useState(firstShown)
  const links = useMemo(
    () => (graph ? graph.edges({ page }, 'in').filter(edge => edge.from.fileId !== exclude) : []),
    [exclude, graph, page],
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
                    <LinkLine edge={edge} page={page} />
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
