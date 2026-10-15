import {
  FileCode2,
  FileDown,
  FileImage,
  FileQuestion,
  FileText,
  LoaderCircle,
  Star,
  Trash2,
} from 'lucide-react'
import type { PreviewKind, StoredFileMetadata } from '../../core/files'
import { formatBytes } from '../../utils/bytes'
import { baseName } from '../../utils/path'

export type FileRowContext = {
  activeId: string | null
  onOpen: (id: string) => void
  onRemove: (file: StoredFileMetadata) => void
  onSaveAs: (id: string) => void
  savingFileId: string | null
  exportBusy: boolean
  starredIds: ReadonlySet<string>
  onToggleStar: (id: string) => void
}

export type FileRowProps = {
  file: StoredFileMetadata
  depth?: number
  showPath?: boolean
  openedAt?: number
  context: FileRowContext
}

const FileKindIcon = ({ kind }: { kind: PreviewKind }) => {
  if (kind === 'image') return <FileImage size={15} />
  if (kind === 'html') return <FileCode2 size={15} />
  if (kind === 'unsupported') return <FileQuestion size={15} />
  return <FileText size={15} />
}

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' })

export const FileRow = ({ file, depth = 0, showPath = false, openedAt, context }: FileRowProps) => {
  const starred = context.starredIds.has(file.id)
  const label = file.collection === 'attachments' ? 'Attachments' : 'Files'
  const directory = file.path.slice(0, Math.max(0, file.path.lastIndexOf('/')))
  const location =
    label === 'Attachments'
      ? ['Attachments', directory].filter(Boolean).join(' / ')
      : directory || 'Files'
  return (
    <li className="resource-row">
      <button
        type="button"
        className={context.activeId === file.id ? 'resource-item active' : 'resource-item'}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => context.onOpen(file.id)}
        aria-current={context.activeId === file.id ? 'page' : undefined}
        title={`${file.path} · ${formatBytes(file.size)}`}
      >
        <FileKindIcon kind={file.previewKind} />
        <span className="resource-file-label">
          <span>{baseName(file.path)}</span>
          {showPath && (
            <span className="resource-file-path" title={location}>
              {location}
            </span>
          )}
          {openedAt !== undefined && (
            <time
              className="resource-file-time"
              dateTime={new Date(openedAt).toISOString()}
              title={new Date(openedAt).toLocaleString()}
            >
              {timeFormat.format(openedAt)}
            </time>
          )}
        </span>
      </button>
      <span className="resource-actions">
        <button
          type="button"
          className="icon-button resource-star"
          aria-label={`${starred ? 'Unstar' : 'Star'} ${file.path}`}
          aria-pressed={starred}
          title={starred ? 'Unstar' : 'Star'}
          onClick={() => context.onToggleStar(file.id)}
        >
          <Star size={13} fill={starred ? 'currentColor' : 'none'} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={`Save ${file.path} as`}
          title="Save as…"
          disabled={context.exportBusy}
          onClick={() => context.onSaveAs(file.id)}
        >
          {context.savingFileId === file.id ? (
            <LoaderCircle className="folder-save-spinner" size={13} />
          ) : (
            <FileDown size={13} />
          )}
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={`Remove ${file.path} from ${label}`}
          title={`Remove from ${label}`}
          onClick={() => context.onRemove(file)}
        >
          <Trash2 size={13} />
        </button>
      </span>
    </li>
  )
}
