import { baseName, type ImportSource } from '../core/files'
import { type FolderSelection, selectFolderFiles } from '../core/folder-import'
import type { ImportTarget } from '../core/url-import'
import { mapWithLimit } from '../utils/map-with-limit'

// A sentence for the reader saying why an address could not be downloaded.
export class RemoteFileError extends Error {}

// The browser reports a site that refuses cross-origin reads the same way as one it cannot reach.
const unreachable =
  'This site does not let web pages download its files, or could not be reached. Download the file and drag it into Files.'

const request = async (url: string) => {
  const response = await fetch(url).catch((cause: unknown) => {
    throw cause instanceof TypeError ? new RemoteFileError(unreachable, { cause }) : cause
  })
  if (response.ok) return response
  if (response.status === 404) throw new RemoteFileError('Nothing was found at that address.')
  if (response.headers.get('x-ratelimit-remaining') === '0')
    throw new RemoteFileError(
      'GitHub allows 60 folder listings an hour from one network, and they are used up. Try again later.',
    )
  throw new RemoteFileError(`The site returned HTTP ${response.status}.`)
}

// The file with the address it was finally served from, which a page's relative links start at.
export const fetchRemoteFile = async (target: Extract<ImportTarget, { kind: 'file' }>) => {
  const response = await request(target.url)
  const type = response.headers.get('content-type')?.split(';')[0]?.trim() ?? ''
  // An address such as a DOI landing link rarely ends in the extension that says what it holds.
  const name =
    type === 'application/pdf' && !/\.pdf$/i.test(target.name) ? `${target.name}.pdf` : target.name
  return { file: new File([await response.blob()], name, { type }), url: response.url }
}

export const downloadFile = async (target: Extract<ImportTarget, { kind: 'file' }>) =>
  (await fetchRemoteFile(target)).file

export const fetchRemoteBlob = async (url: string) => (await request(url)).blob()

type TreeItem = { path: string; type: string; size?: number }
type Tree = { truncated: boolean; tree: TreeItem[] }

const isTree = (value: unknown): value is Tree =>
  typeof value === 'object' &&
  value !== null &&
  'tree' in value &&
  Array.isArray(value.tree) &&
  'truncated' in value &&
  typeof value.truncated === 'boolean'

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')

// One listing gives every path and size, so the files a chosen folder would leave out are left
// out before anything is downloaded, and only the rest are fetched from raw content.
export const downloadRepository = async (
  target: Extract<ImportTarget, { kind: 'repository' }>,
  onProgress: (done: number, total: number) => void,
): Promise<FolderSelection> => {
  const { owner, repo, ref, subpath, name } = target
  const listing: unknown = await (
    await request(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    )
  ).json()
  if (!isTree(listing))
    throw new RemoteFileError('GitHub returned a folder listing it could not read.')
  if (listing.truncated) return { status: 'too-many' }
  const within = subpath ? `${subpath}/` : ''
  const selection = selectFolderFiles(
    listing.tree.flatMap(item =>
      item.type === 'blob' && item.path.startsWith(within)
        ? [{ path: `${name}/${item.path}`, file: { size: item.size ?? 0, type: '' }, item }]
        : [],
    ),
  )
  if (selection.status === 'too-many') return selection
  let done = 0
  const sources = await mapWithLimit(
    selection.sources,
    6,
    async ({ path, item }): Promise<ImportSource> => {
      const response = await request(
        `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}/${encodePath(item.path)}`,
      )
      const file = new File([await response.blob()], baseName(path))
      done += 1
      onProgress(done, selection.sources.length)
      return { path, file }
    },
  )
  return { status: 'ready', sources, skipped: selection.skipped }
}
