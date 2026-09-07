import { BookOpen, FileText, FolderPlus, PanelLeft, Plus, Save } from 'lucide-react'
import { samples } from '../../core/samples'

type ResourcePanelProps = {
  activeId: string | null
  onOpen: (id: string) => void
  onClose: () => void
}

export const ResourcePanel = ({ activeId, onOpen, onClose }: ResourcePanelProps) => {
  return (
    <aside className="resource-panel panel-surface" aria-label="Files">
      <header className="panel-header brand-header">
        <span className="brand" title="Gamma Reader">
          <BookOpen size={18} strokeWidth={1.8} /> <span>Gamma Reader</span>
        </span>
        <button
          className="icon-button"
          type="button"
          onClick={onClose}
          aria-label="Hide files"
          title="Hide files"
        >
          <PanelLeft size={16} />
        </button>
      </header>
      <div className="resource-toolbar">
        <h2>Files</h2>
        <button
          className="icon-button"
          type="button"
          popoverTarget="add-files"
          aria-label="Add files or folder"
          title="Add files or folder"
        >
          <Plus size={16} />
        </button>
        <div id="add-files" className="add-popover" popover="auto">
          <button type="button" disabled>
            <FileText size={16} /> Add files
          </button>
          <button type="button" disabled>
            <FolderPlus size={16} /> Add folder
          </button>
        </div>
      </div>
      <div className="resource-list">
        <ul aria-label="Files">
          {samples.map(document => (
            <li key={document.id}>
              <button
                type="button"
                className={activeId === document.id ? 'resource-item active' : 'resource-item'}
                onClick={() => onOpen(document.id)}
                aria-current={activeId === document.id ? 'page' : undefined}
                title={document.name}
              >
                <FileText size={15} />
                <span>{document.title}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <footer className="resource-footer">
        <button
          className="save-button"
          type="button"
          disabled
          title="Saving is not available yet. Reloading clears reading drafts and excerpts."
        >
          <Save size={15} /> <span>Save to folder</span>
        </button>
      </footer>
    </aside>
  )
}
