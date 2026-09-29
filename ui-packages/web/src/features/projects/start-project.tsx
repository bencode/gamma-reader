import { NewProjectForm } from './new-project-form'
import styles from './style.module.scss'

export const StartProject = () => (
  <div className={styles.empty}>
    <p>Create a project to add documents.</p>
    <NewProjectForm newTab={false} />
  </div>
)
