import {
  type Context,
  type ExecutionEnv,
  ExecutionError,
  err,
  FileError,
  type FileInfo,
  ok,
  toError,
} from '@earendil-works/pi-agent-core'
import { listStoredFiles } from '../../data/file-store'
import type { WorkspaceTextWriter } from '../local-tools'

const root = '/workspace'

const fileName = (path: string) => {
  const relative = path.startsWith(`${root}/`)
    ? path.slice(root.length + 1)
    : path.replace(/^\.\//, '')
  if (
    !relative ||
    path === root ||
    (path.startsWith('/') && !path.startsWith(`${root}/`)) ||
    relative.includes('/') ||
    relative.includes('\\') ||
    relative === '.' ||
    relative === '..' ||
    [...relative].some(character => character.charCodeAt(0) < 32)
  )
    throw new FileError(
      'invalid',
      'Use one file name in the workspace root without parent traversal.',
      path,
    )
  return relative
}

const attempt = async <T>(path: string, action: () => T | Promise<T>, context: Context) => {
  const signal = context.abortSignal
  try {
    signal?.throwIfAborted()
    return ok<T, FileError>(await action())
  } catch (cause) {
    const error = toError(cause)
    return err<T, FileError>(
      cause instanceof FileError
        ? cause
        : new FileError(
            signal?.aborted ? 'aborted' : 'unknown',
            signal?.aborted ? 'Operation aborted.' : error.message,
            path,
            error,
          ),
    )
  }
}

const unsupported = async <T>() =>
  err<T, FileError>(
    new FileError('not_supported', 'This operation is not available in the browser workspace.'),
  )

const metadataFor = async (path: string) => {
  const requested = fileName(path)
  const metadata = (await listStoredFiles()).find(
    file => file.name.toLowerCase() === requested.toLowerCase(),
  )
  if (!metadata) throw new FileError('not_found', `File not found: ${requested}`, path)
  return metadata
}

export const createWorkspaceWriteEnv = (writeTextFile: WorkspaceTextWriter): ExecutionEnv => ({
  cwd: root,
  absolutePath: (path, context) => attempt(path, () => `${root}/${fileName(path)}`, context),
  canonicalPath: (path, context) =>
    attempt(path, async () => `${root}/${(await metadataFor(path)).name}`, context),
  exists: (path, context) =>
    attempt(
      path,
      async () => {
        try {
          await metadataFor(path)
          return true
        } catch (cause) {
          if (cause instanceof FileError && cause.code === 'not_found') return false
          throw cause
        }
      },
      context,
    ),
  fileInfo: (path, context) =>
    attempt<FileInfo>(
      path,
      async () => {
        const metadata = await metadataFor(path)
        return {
          name: metadata.name,
          path: `${root}/${metadata.name}`,
          kind: 'file',
          size: metadata.size,
          mtimeMs: metadata.lastModified,
        }
      },
      context,
    ),
  writeFile: (path, content, context) =>
    attempt(
      path,
      async () => {
        if (typeof content !== 'string')
          throw new FileError('not_supported', 'Only UTF-8 text content can be written.', path)
        await writeTextFile(fileName(path), content, context.abortSignal)
      },
      context,
    ),
  joinPath: () => unsupported<string>(),
  readTextFile: () => unsupported<string>(),
  readTextLines: () => unsupported<string[]>(),
  readBinaryFile: () => unsupported<Uint8Array>(),
  appendFile: () => unsupported<void>(),
  renameFile: () => unsupported<void>(),
  listDir: () => unsupported<FileInfo[]>(),
  createDir: () => unsupported<void>(),
  remove: () => unsupported<void>(),
  createTempDir: () => unsupported<string>(),
  createTempFile: () => unsupported<string>(),
  exec: async () =>
    err(new ExecutionError('shell_unavailable', 'No shell is available in the browser workspace.')),
  cleanup: async () => {},
})
