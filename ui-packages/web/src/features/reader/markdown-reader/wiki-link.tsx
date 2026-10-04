import { headingKey, type LinkTarget, parseTarget } from '@gamma-reader/links'
import * as Popover from '@radix-ui/react-popover'
import { type ReactNode, useState } from 'react'
import { useLinkGraph, useOpenFile } from '../../../shell/workspace-context'
import type { RevealTarget } from '../../../shell/workspace-store'
import styles from './style.module.scss'

// The place in its file a link names, for the file's reader to show.
export const placeOf = (target: LinkTarget): RevealTarget | null =>
  target.block
    ? { block: target.block }
    : target.heading
      ? { heading: headingKey(target.heading) }
      : target.pdfPage
        ? { page: target.pdfPage }
        : null

type WikiLinkProps = { raw: string; kind: string; children: ReactNode }

// A [[link]] as the reader shows it. Its page is found by name in the link graph: one file opens
// at the place the link names, several are offered to choose from, and none leaves it inert, as
// a page that is only linked has nothing to open yet.
export const WikiLink = ({ raw, kind, children }: WikiLinkProps) => {
  const graph = useLinkGraph()
  const openFile = useOpenFile()
  const [choosing, setChoosing] = useState(false)
  const { target } = parseTarget(raw)
  const resolution = graph?.resolve(target)
  const page = graph?.node({ page: target.page })
  const owners = page?.kind === 'page' ? page.files : []
  const className = `${styles.wikiLink} ${kind === 'tag' ? styles.tag : ''}`

  if (!resolution)
    return (
      <button type="button" className={className} aria-disabled title="Links are being indexed.">
        {children}
      </button>
    )
  if (resolution.kind === 'virtual')
    return (
      <button
        type="button"
        className={`${className} ${styles.virtual}`}
        aria-disabled
        title={`No note named ${target.page} yet.`}
      >
        {children}
      </button>
    )
  if (resolution.kind === 'file')
    return (
      <button
        type="button"
        className={className}
        title={owners[0]?.path}
        onClick={() => openFile(resolution.fileId, placeOf(target))}
      >
        {children}
      </button>
    )

  return (
    <Popover.Root open={choosing} onOpenChange={setChoosing}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={className}
          title={`${owners.length} notes are named ${target.page}.`}
        >
          {children}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={styles.linkChoices}
          align="start"
          sideOffset={4}
          collisionPadding={8}
          aria-label={`Notes named ${target.page}`}
        >
          <ul>
            {owners.map(file => (
              <li key={file.id}>
                <button
                  type="button"
                  title={file.path}
                  onClick={() => {
                    setChoosing(false)
                    openFile(file.id, placeOf(target))
                  }}
                >
                  {file.path}
                </button>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
