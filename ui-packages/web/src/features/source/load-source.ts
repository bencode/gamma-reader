import type { ProjectSource } from '../../core/projects'
import { isProjectSource } from './protocol'

// The sources a deployment's projects sync from; most deployments name none. One that cannot be
// asked opens as they do.
export const loadProjectSources = async (): Promise<ProjectSource[]> => {
  try {
    const response = await fetch('/api/sources', { cache: 'no-store' })
    if (!response.ok) throw new Error(`The sources returned HTTP ${response.status}.`)
    const body: unknown = await response.json()
    return Array.isArray(body) ? body.filter(isProjectSource) : []
  } catch (cause) {
    console.error('Unable to read the source configuration', cause)
    return []
  }
}
