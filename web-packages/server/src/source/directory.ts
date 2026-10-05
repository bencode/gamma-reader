import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { Readable } from 'node:stream'
import type { Source, SourceFile } from './repository.js'

const sha1 = (content: string | Uint8Array) => createHash('sha1').update(content).digest('hex')

// Every file under the folder, hidden ones left out, named by its path from the folder.
const filesUnder = async (dir: string) =>
  (await readdir(dir, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile())
    .map(entry => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .filter(path => !path.split('/').some(segment => segment.startsWith('.')))
    .sort()

// A folder served as it is, read-only and without git, as the tutorial is shipped with each
// deployment. A listing reads only what changed since the last one, by size and modified time,
// so asking whether anything changed costs a look at the folder, and an edit while writing the
// tutorial shows at once.
export const openDirectory = (dir: string): Source => {
  let hashed = new Map<string, { stamp: string; file: SourceFile }>()
  const listing = async () => {
    hashed = new Map(
      await Promise.all(
        (await filesUnder(dir)).map(async path => {
          const stats = await stat(join(dir, path))
          const stamp = `${stats.mtimeMs}:${stats.size}`
          const known = hashed.get(path)
          if (known?.stamp === stamp) return [path, known] as const
          const content = await readFile(join(dir, path))
          const file = { path, version: sha1(content), size: content.byteLength }
          return [path, { stamp, file }] as const
        }),
      ),
    )
    const files = [...hashed.values()].map(entry => entry.file)
    return {
      version: sha1(files.map(file => `${file.path}\t${file.version}`).join('\n')),
      files,
    }
  }
  return {
    listing,
    // Only a listed path is read, so no path can reach outside the folder.
    blob: async path => {
      if (!hashed.has(path)) await listing()
      const file = hashed.get(path)?.file
      if (!file) return null
      const stream = Readable.toWeb(createReadStream(join(dir, path)))
      return { file, stream: stream as ReadableStream<Uint8Array> }
    },
  }
}
