import { ProjectSwitcher } from '../features/projects/project-switcher'
import { StartProject } from '../features/projects/start-project'

export const EmptyWorkbench = () => (
  <div className="workbench">
    <aside className="resource-panel panel-surface empty-workbench" aria-label="Files">
      <header className="panel-header brand-header">
        <ProjectSwitcher project={null} />
      </header>
      <StartProject />
    </aside>
  </div>
)
