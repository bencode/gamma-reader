import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderPlus,
  PanelLeftClose,
  Plus,
  Save,
} from 'lucide-react'
import { useState } from 'react'
import { samples } from '../../core/samples'

type ResourcePanelProps = {
  activeId: string | null
  onOpen: (id: string) => void
  onClose: () => void
}

export const ResourcePanel = ({ activeId, onOpen, onClose }: ResourcePanelProps) => {
  const [examplesOpen, setExamplesOpen] = useState(true)

  return (
    <aside className="resource-panel panel-surface" aria-label="Materials">
      <header className="panel-header brand-header">
        <span className="brand">
          <BookOpen size={19} strokeWidth={1.8} /> Gamma Reader
        </span>
        <button
          className="icon-button"
          type="button"
          onClick={onClose}
          aria-label="Hide materials"
          title="Hide materials"
        >
          <PanelLeftClose size={17} />
        </button>
      </header>
      <div className="resource-toolbar">
        <h2>Materials</h2>
        <button
          className="icon-button"
          type="button"
          popoverTarget="add-materials"
          aria-label="Add materials"
          title="Add materials"
        >
          <Plus size={17} />
        </button>
        <div id="add-materials" className="add-popover" popover="auto">
          <button type="button" disabled>
            <FileText size={16} /> Add files
          </button>
          <button type="button" disabled>
            <FolderPlus size={16} /> Add folder
          </button>
          <p>Local files will be available in a later update.</p>
        </div>
      </div>
      <div className="resource-list">
        <button
          className="resource-group"
          type="button"
          onClick={() => setExamplesOpen(!examplesOpen)}
          aria-expanded={examplesOpen}
        >
          {examplesOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Examples
        </button>
        {examplesOpen && (
          <ul aria-label="Example documents">
            {samples.map(document => (
              <li key={document.id}>
                <button
                  type="button"
                  className={activeId === document.id ? 'resource-item active' : 'resource-item'}
                  onClick={() => onOpen(document.id)}
                  aria-current={activeId === document.id ? 'page' : undefined}
                  title={document.description}
                >
                  <FileText size={16} />
                  <span>{document.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <h3 className="resource-group your-files">Your files</h3>
        <p className="resource-hint">
          Your own documents will appear here when local files are connected.
        </p>
      </div>
      <footer className="resource-footer">
        <button
          className="save-button"
          type="button"
          disabled
          title="Saving to a folder is not available yet"
        >
          <Save size={15} /> Save to folder
        </button>
        <div className="session-label">
          <span className="session-dot" /> Session only
        </div>
        <p>Reloading resets this preview.</p>
      </footer>
    </aside>
  )
}
