import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileDown,
  FileImage,
  FileQuestion,
  FileText,
  LoaderCircle,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { formatBytes, type PreviewKind, type StoredFileMetadata } from '../../core/files'
import { ancestorFolders, buildFileTree, type FileTreeNode } from './file-tree'

type ResourceTreeProps = {
  files: StoredFileMetadata[]
  label: 'Files' | 'Attachments'
  activeId: string | null
  onOpen: (id: string) => void
  onRemove: (file: StoredFileMetadata) => void
  onRemoveFolder: (path: string) => void
  onSaveAs: (id: string) => void
  savingFileId: string | null
  exportBusy: boolean
}

type RowContext = Omit<ResourceTreeProps, 'files'> & {
  expanded: ReadonlySet<string>
  onToggle: (key: string) => void
}

const indent = (depth: number) => ({ paddingLeft: 8 + depth * 14 })

const FileKindIcon = ({ kind }: { kind: PreviewKind }) => {
  if (kind === 'image') return <FileImage size={15} />
  if (kind === 'html') return <FileCode2 size={15} />
  if (kind === 'unsupported') return <FileQuestion size={15} />
  return <FileText size={15} />
}

const FileRow = ({
  file,
  name,
  depth,
  context,
}: {
  file: StoredFileMetadata
  name: string
  depth: number
  context: RowContext
}) => (
  <li className="resource-row">
    <button
      type="button"
      className={context.activeId === file.id ? 'resource-item active' : 'resource-item'}
      style={indent(depth)}
      onClick={() => context.onOpen(file.id)}
      aria-current={context.activeId === file.id ? 'page' : undefined}
      title={`${file.path} · ${formatBytes(file.size)}`}
    >
      <FileKindIcon kind={file.previewKind} />
      <span>{name}</span>
    </button>
    <span className="resource-actions">
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
        aria-label={`Remove ${file.path} from ${context.label}`}
        title={`Remove from ${context.label}`}
        onClick={() => context.onRemove(file)}
      >
        <Trash2 size={13} />
      </button>
    </span>
  </li>
)

const TreeRows = ({
  nodes,
  depth,
  context,
}: {
  nodes: readonly FileTreeNode[]
  depth: number
  context: RowContext
}) =>
  nodes.map(node => {
    if (node.kind === 'file')
      return (
        <FileRow
          key={node.file.id}
          file={node.file}
          name={node.name}
          depth={depth}
          context={context}
        />
      )
    const open = context.expanded.has(node.key)
    return (
      <li key={node.key}>
        <div className="resource-row">
          <button
            type="button"
            className="resource-item resource-folder"
            style={indent(depth)}
            aria-expanded={open}
            onClick={() => context.onToggle(node.key)}
          >
            {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            <span>{node.name}</span>
          </button>
          <span className="resource-actions">
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove folder ${node.path} from ${context.label}`}
              title="Remove folder"
              onClick={() => context.onRemoveFolder(node.path)}
            >
              <Trash2 size={13} />
            </button>
          </span>
        </div>
        {open && (
          <ul>
            <TreeRows nodes={node.children} depth={depth + 1} context={context} />
          </ul>
        )}
      </li>
    )
  })

export const ResourceTree = ({ files, ...props }: ResourceTreeProps) => {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const activePath = files.find(file => file.id === props.activeId)?.path ?? null
  const [revealedPath, setRevealedPath] = useState<string | null>(null)

  // Opening a file, or the open file moving, reveals its folders once; the reader may fold them
  // again afterwards.
  if (activePath !== revealedPath) {
    setRevealedPath(activePath)
    const ancestors = activePath ? ancestorFolders(activePath) : []
    if (ancestors.some(key => !expanded.has(key))) setExpanded(new Set([...expanded, ...ancestors]))
  }

  const onToggle = (key: string) =>
    setExpanded(current => {
      const next = new Set(current)
      if (!next.delete(key)) next.add(key)
      return next
    })

  return (
    <ul aria-label={props.label}>
      <TreeRows nodes={buildFileTree(files)} depth={0} context={{ ...props, expanded, onToggle }} />
    </ul>
  )
}
