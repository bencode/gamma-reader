import type { StoredFileMetadata } from '../../core/files'
import { FileRow, type FileRowContext } from './file-row'

export type FileListProps = {
  label: 'Recent' | 'Starred'
  items: { file: StoredFileMetadata; openedAt?: number }[]
  context: FileRowContext
}

export const FileList = ({ label, items, context }: FileListProps) => (
  <ul aria-label={label} className="resource-flat-list">
    {items.map(({ file, openedAt }) => (
      <FileRow key={file.id} file={file} openedAt={openedAt} showPath context={context} />
    ))}
  </ul>
)
