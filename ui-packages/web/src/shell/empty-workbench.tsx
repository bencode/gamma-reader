import { NewProjectForm } from '../features/projects/new-project-form'
import { ProjectSwitcher } from '../features/projects/project-switcher'
import styles from '../features/projects/style.module.scss'

export const EmptyWorkbench = () => (
  <div className="workbench">
    <aside className="resource-panel panel-surface empty-workbench" aria-label="Files">
      <header className="panel-header brand-header">
        <ProjectSwitcher project={null} />
      </header>
      <div className={styles.empty}>
        <p>Create a project to add documents.</p>
        <NewProjectForm newTab={false} />
      </div>
    </aside>
  </div>
)
