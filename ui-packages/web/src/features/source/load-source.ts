import type { ProjectSource } from '../../core/projects'
import { isProjectSource } from './protocol'

// Most deployments have no source and answer 404; one that cannot be asked opens as they do.
export const loadProjectSource = async (): Promise<ProjectSource | null> => {
  try {
    const response = await fetch('/api/source', { cache: 'no-store' })
    if (!response.ok) return null
    const body: unknown = await response.json()
    return isProjectSource(body) ? body : null
  } catch (cause) {
    console.error('Unable to read the source configuration', cause)
    return null
  }
}
