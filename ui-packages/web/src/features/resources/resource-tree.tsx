import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { StoredFileMetadata } from '../../core/files'
import { FileRow, type FileRowContext } from './file-row'
import { ancestorFolders, buildFileTree, type FileTreeNode } from './file-tree'

type ResourceTreeProps = FileRowContext & {
  files: StoredFileMetadata[]
  // The normalized filter the files were chosen by; empty when nothing is filtered.
  filter: string
  label: 'Files' | 'Attachments'
  onRemoveFolder: (path: string) => void
}

type RowContext = Omit<ResourceTreeProps, 'files' | 'filter'> & {
  isOpen: (key: string) => boolean
  onToggle: (key: string) => void
}

const indent = (depth: number) => ({ paddingLeft: 8 + depth * 14 })

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
      return <FileRow key={node.file.id} file={node.file} depth={depth} context={context} />
    const open = context.isOpen(node.key)
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

const toggled = (set: ReadonlySet<string>, key: string) => {
  const next = new Set(set)
  if (!next.delete(key)) next.add(key)
  return next
}

export const ResourceTree = ({ files, filter, ...props }: ResourceTreeProps) => {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  // A filtered tree shows every folder holding a match open. Folding one there is kept apart from
  // the folders opened by hand, and forgotten when the filter changes, so clearing the filter
  // leaves the tree as it was.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const [collapsedFor, setCollapsedFor] = useState(filter)
  if (filter !== collapsedFor) {
    setCollapsedFor(filter)
    setCollapsed(new Set())
  }
  const activePath = files.find(file => file.id === props.activeId)?.path ?? null
  const [revealedPath, setRevealedPath] = useState<string | null>(null)

  // Opening a file, or the open file moving, reveals its folders once; the reader may fold them
  // again afterwards.
  if (activePath !== revealedPath) {
    setRevealedPath(activePath)
    const ancestors = activePath ? ancestorFolders(activePath) : []
    if (ancestors.some(key => !expanded.has(key))) setExpanded(new Set([...expanded, ...ancestors]))
  }

  const isOpen = (key: string) => (filter ? !collapsed.has(key) : expanded.has(key))
  const onToggle = (key: string) =>
    filter
      ? setCollapsed(current => toggled(current, key))
      : setExpanded(current => toggled(current, key))

  return (
    <ul aria-label={props.label}>
      <TreeRows nodes={buildFileTree(files)} depth={0} context={{ ...props, isOpen, onToggle }} />
    </ul>
  )
}
