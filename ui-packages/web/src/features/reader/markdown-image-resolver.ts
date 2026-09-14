import type { MarkdownImageResolver } from '../../components/markdown-image'
import type { StoredFileMetadata } from '../../core/files'
import { getStoredFileContent } from '../../data/file-store'

type PathAwareFile = StoredFileMetadata & { path?: string }

const unsafeScheme = /^[a-z][a-z\d+.-]*:/i

const containsControlCharacter = (value: string) =>
  Array.from(value).some(character => {
    const codePoint = character.codePointAt(0)
    return codePoint !== undefined && (codePoint < 32 || codePoint === 127)
  })

export const workspacePathFor = (file: PathAwareFile) => file.path ?? file.name

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

export const resolveMarkdownImagePath = (reference: string, basePath: string) => {
  const trimmed = reference.trim()
  if (!trimmed || trimmed.startsWith('//') || unsafeScheme.test(trimmed)) return null
  const path = decodedPath(trimmed)
  if (!path) return null
  const segments = path.startsWith('/') ? [] : basePath.split('/').slice(0, -1).filter(Boolean)
  if (!appendSegments(segments, path)) return null
  return segments.join('/') || null
}

export const findMarkdownImageFile = (
  files: readonly PathAwareFile[],
  reference: string,
  basePath: string,
) => {
  const path = resolveMarkdownImagePath(reference, basePath)?.toLowerCase()
  if (!path) return null
  return (
    files.find(
      file =>
        (file.collection ?? 'files') === 'files' &&
        file.previewKind === 'image' &&
        workspacePathFor(file).toLowerCase() === path,
    ) ?? null
  )
}

export const createMarkdownImageResolver = (
  files: readonly PathAwareFile[],
): MarkdownImageResolver => {
  return async (reference, basePath) => {
    const file = findMarkdownImageFile(files, reference, basePath)
    return file ? getStoredFileContent(file.id) : null
  }
}
