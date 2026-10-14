import { containsControlCharacter } from './path'

const unsafeScheme = /^[a-z][a-z\d+.-]*:/i

const decodedPath = (reference: string) => {
  const path = reference.split(/[?#]/, 1)[0]
  if (!path) return null
  try {
    const decoded = decodeURIComponent(path)
    return decoded.includes('\\') || containsControlCharacter(decoded) ? null : decoded
  } catch (error) {
    if (!(error instanceof URIError)) throw error
    return null
  }
}

const appendSegments = (segments: string[], path: string) => {
  for (const segment of path.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (segments.length === 0) return false
      segments.pop()
    } else {
      segments.push(segment)
    }
  }
  return true
}

export const resolveFileReferencePath = (reference: string, basePath: string) => {
  const trimmed = reference.trim()
  if (!trimmed || trimmed.startsWith('//') || unsafeScheme.test(trimmed)) return null
  const path = decodedPath(trimmed)
  if (!path) return null
  const segments = path.startsWith('/') ? [] : basePath.split('/').slice(0, -1).filter(Boolean)
  if (!appendSegments(segments, path)) return null
  return segments.join('/') || null
}
