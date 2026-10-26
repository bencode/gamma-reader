import type { ComponentProps, ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { MarkdownAnchor } from '../../../components/markdown'
import { resolveFileReferencePath } from '../../../utils/file-reference'
import { useOpenFile } from '../../workspace/workspace-context'
import { useEmbedScope } from './embed-context'

export type FileLinkProps = Pick<ComponentProps<'a'>, 'href' | 'id' | 'children'>

export const FileLink = ({ href, id, children }: FileLinkProps): ReactElement => {
  const scope = useEmbedScope()
  const openFile = useOpenFile()
  if (!scope || !href || /^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(href.trim()))
    return (
      <MarkdownAnchor href={href} id={id} variant="reader">
        {children}
      </MarkdownAnchor>
    )

  const path = resolveFileReferencePath(href, scope.basePath)
  const file = path
    ? scope.files.find(
        file =>
          (file.collection ?? 'files') === 'files' &&
          file.path.toLowerCase() === path.toLowerCase(),
      )
    : undefined
  if (!file)
    return (
      <span
        aria-disabled
        title={path ? `File not found in this project: ${path}` : `Invalid file link: ${href}`}
      >
        {children}
      </span>
    )

  return (
    <Link
      to={`/files/${file.path.split('/').map(encodeURIComponent).join('/')}`}
      title={file.path}
      onClick={event => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return
        event.preventDefault()
        openFile(file.id, null)
      }}
    >
      {children}
    </Link>
  )
}
