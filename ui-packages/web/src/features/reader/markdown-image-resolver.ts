import type { MarkdownImageResolver } from '../../components/markdown-image'
import type { StoredFileMetadata } from '../../core/files'
import { getStoredFileContent } from '../../data/file-store'
import { resolveFileReferencePath as resolveMarkdownImagePath } from '../../utils/file-reference'

export { resolveMarkdownImagePath }

export const findMarkdownImageFile = (
  files: readonly StoredFileMetadata[],
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
        file.path.toLowerCase() === path,
    ) ?? null
  )
}

export const createMarkdownImageResolver = (
  files: readonly StoredFileMetadata[],
): MarkdownImageResolver => {
  return async (reference, basePath) => {
    const file = findMarkdownImageFile(files, reference, basePath)
    return file ? getStoredFileContent(file.id) : null
  }
}
