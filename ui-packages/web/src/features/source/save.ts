import type { ProjectSource } from '../../core/projects'
import { getStoredFile } from '../../data/file-store'
import { baseName } from '../../utils/path'
import type { SaveChange } from './plan'
import { isSaveResult, type SaveResult, SourceError, sourceSaveUrl } from './protocol'

// Sends every change in one request: the list as JSON, and each write's bytes in a part of its
// own, so a binary file travels as it is.
export const saveToSource = async (
  source: ProjectSource,
  changes: readonly SaveChange[],
): Promise<SaveResult[]> => {
  const form = new FormData()
  const wire = await Promise.all(
    changes.map(async (change, index) => {
      if (change.kind !== 'write') return change
      const stored = await getStoredFile(change.id)
      if (!stored) throw new SourceError(`${change.path} left the library before it was saved.`)
      const part = `c${index}`
      form.append(part, stored.blob, baseName(change.path))
      return { kind: change.kind, path: change.path, base: change.base, part }
    }),
  )
  form.append('changes', JSON.stringify(wire))
  const response = await fetch(sourceSaveUrl(source), { method: 'POST', body: form })
  if (!response.ok)
    throw new SourceError(`Saving to ${source.name} returned HTTP ${response.status}.`)
  const results: unknown = await response.json()
  if (!Array.isArray(results) || !results.every(isSaveResult))
    throw new SourceError(`${source.name} sent an answer to the save it could not read.`)
  return results
}
