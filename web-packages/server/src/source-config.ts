import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

// A deployment can bind its library to a source, which the reader keeps in sync. The source is
// either any address serving the listing the reader asks for, or a git repository this server
// serves itself: a working tree read as it is on disk, or a clone it keeps pulling.
export type SourceConfig =
  | { kind: 'remote'; name: string; url: string }
  | { kind: 'worktree'; name: string; dir: string; include: string[]; exclude: string[] }
  | {
      kind: 'clone'
      name: string
      repo: string
      dir: string
      include: string[]
      exclude: string[]
      pullSeconds: number
    }

type Env = Record<string, string | undefined>

// Where the reader finds a source this server serves.
export const libraryPath = '/api/library'

// Where the reader finds the tutorial, which ships with the deployment.
export const tutorialPath = '/api/tutorial'

const positiveInteger = (name: string, raw: string | undefined, fallback: number) => {
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`)
  return value
}

// Folders of the repository, such as knowledge,journal, named from the repository root; a folder
// may not climb out of it. Included folders are all a source lists, when any are named, and
// excluded ones are left out of it.
const folders = (variable: string, raw: string | undefined) => {
  const names = (raw ?? '')
    .split(',')
    .map(name => name.trim().replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
  if (names.some(name => name.split('/').some(segment => segment === '..' || segment === '.')))
    throw new Error(`${variable} folders must be named from the repository root`)
  return names
}

const misconfigured = () =>
  new Error(
    'Set GAMMA_SOURCE_NAME with exactly one of GAMMA_SOURCE_URL, GAMMA_SOURCE_WORKTREE and GAMMA_SOURCE_REPO',
  )

export const readSourceConfig = (env: Env): SourceConfig | null => {
  const name = env.GAMMA_SOURCE_NAME?.trim()
  const url = env.GAMMA_SOURCE_URL?.trim()
  const worktree = env.GAMMA_SOURCE_WORKTREE?.trim()
  const repo = env.GAMMA_SOURCE_REPO?.trim()
  const places = [url, worktree, repo].filter(Boolean).length
  if (!name && places === 0) return null
  if (!name || places !== 1) throw misconfigured()
  if (url) return { kind: 'remote', name, url }
  const include = folders('GAMMA_SOURCE_INCLUDE', env.GAMMA_SOURCE_INCLUDE)
  const exclude = folders('GAMMA_SOURCE_EXCLUDE', env.GAMMA_SOURCE_EXCLUDE)
  if (worktree) return { kind: 'worktree', name, dir: worktree, include, exclude }
  if (!repo) throw misconfigured()
  return {
    kind: 'clone',
    name,
    repo,
    dir: env.GAMMA_SOURCE_DIR?.trim() || `${env.GAMMA_DATA_DIR?.trim() || 'data'}/source`,
    include,
    exclude,
    pullSeconds: positiveInteger('GAMMA_SOURCE_PULL_SECONDS', env.GAMMA_SOURCE_PULL_SECONDS, 120),
  }
}

// What the reader is told: where to fetch the listing from. A working tree also takes changes
// back, and names which folder it is, so a library synced from one is never saved into another.
// A repository served from here also says which of its folders it holds, so the reader can say
// why a file was not saved.
export const sourceLocation = (config: SourceConfig) => {
  if (config.kind === 'remote') return { name: config.name, url: config.url }
  const scope = { include: config.include, exclude: config.exclude }
  return config.kind === 'worktree'
    ? {
        name: config.name,
        url: libraryPath,
        writable: true,
        id: createHash('sha1').update(resolve(config.dir)).digest('hex'),
        scope,
      }
    : { name: config.name, url: libraryPath, scope }
}
