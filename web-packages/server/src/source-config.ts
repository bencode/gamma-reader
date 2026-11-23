import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

// A project the reader keeps in step with one folder of a repository this server serves; the
// folder '' is the whole of it.
export type SourceProject = { name: string; folder: string }

// A deployment can bind its library to a source, which the reader keeps in sync. The source is
// either any address serving the listing the reader asks for, or a git repository this server
// serves itself: a working tree read as it is on disk, or a clone it keeps pulling, and pushes
// the reader's saves to when told to. A repository is one project, or one for each folder named.
export type SourceConfig =
  | { kind: 'remote'; name: string; url: string }
  | {
      kind: 'worktree'
      dir: string
      projects: SourceProject[]
      include: string[]
      exclude: string[]
    }
  | {
      kind: 'clone'
      repo: string
      dir: string
      projects: SourceProject[]
      include: string[]
      exclude: string[]
      pullSeconds: number
      push: boolean
    }

type Env = Record<string, string | undefined>

// Where the reader finds a source this server serves.
export const libraryPath = '/api/library'

// Where a project's files are served, routed by its folder as written and asked for with each
// segment encoded.
export const projectRoute = ({ folder }: SourceProject) =>
  folder ? `${libraryPath}/${folder}` : libraryPath

const projectUrl = ({ folder }: SourceProject) =>
  folder ? `${libraryPath}/${folder.split('/').map(encodeURIComponent).join('/')}` : libraryPath

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
    'Set GAMMA_SOURCE_NAME or GAMMA_SOURCE_PROJECTS with exactly one of GAMMA_SOURCE_URL, GAMMA_SOURCE_WORKTREE and GAMMA_SOURCE_REPO',
  )

// Each folder named is a project of its own, named after the folder's last segment. Names make
// the reader's project ids, which ignore case, so two may not differ by case alone. A folder
// segment named files would read as the start of a file's path in the routes.
const projectsIn = (raw: string | undefined): SourceProject[] => {
  const projects = folders('GAMMA_SOURCE_PROJECTS', raw).map(folder => ({
    name: folder.slice(folder.lastIndexOf('/') + 1),
    folder,
  }))
  if (projects.some(({ folder }) => folder.split('/').includes('files')))
    throw new Error('GAMMA_SOURCE_PROJECTS folders may not hold a folder named files')
  const names = projects.map(({ name }) => name.toLowerCase())
  if (new Set(names).size !== names.length)
    throw new Error('GAMMA_SOURCE_PROJECTS folders must end in different names')
  return projects
}

export const readSourceConfig = (env: Env): SourceConfig | null => {
  const name = env.GAMMA_SOURCE_NAME?.trim()
  const listed = projectsIn(env.GAMMA_SOURCE_PROJECTS)
  const url = env.GAMMA_SOURCE_URL?.trim()
  const worktree = env.GAMMA_SOURCE_WORKTREE?.trim()
  const repo = env.GAMMA_SOURCE_REPO?.trim()
  const places = [url, worktree, repo].filter(Boolean).length
  if (!name && listed.length === 0 && places === 0) return null
  if (places !== 1) throw misconfigured()
  if (url) {
    if (listed.length > 0)
      throw new Error('GAMMA_SOURCE_PROJECTS needs GAMMA_SOURCE_WORKTREE or GAMMA_SOURCE_REPO')
    if (!name) throw misconfigured()
    return { kind: 'remote', name, url }
  }
  // Folders named make one project each; the source's name is then not used.
  const projects = listed.length > 0 ? listed : name ? [{ name, folder: '' }] : null
  if (!projects) throw misconfigured()
  const include = folders('GAMMA_SOURCE_INCLUDE', env.GAMMA_SOURCE_INCLUDE)
  const exclude = folders('GAMMA_SOURCE_EXCLUDE', env.GAMMA_SOURCE_EXCLUDE)
  if (worktree) return { kind: 'worktree', dir: worktree, projects, include, exclude }
  if (!repo) throw misconfigured()
  return {
    kind: 'clone',
    repo,
    projects,
    dir: env.GAMMA_SOURCE_DIR?.trim() || `${env.GAMMA_DATA_DIR?.trim() || 'data'}/source`,
    include,
    exclude,
    pullSeconds: positiveInteger('GAMMA_SOURCE_PULL_SECONDS', env.GAMMA_SOURCE_PULL_SECONDS, 120),
    push: env.GAMMA_SOURCE_PUSH?.trim() === '1',
  }
}

const writableAt = (place: string) => ({
  writable: true,
  id: createHash('sha1').update(place).digest('hex'),
})

// What the reader is told of each project: where to fetch its listing from. A working tree, and a
// clone pushed to, also take changes back, and name which folder of which repository they are, so
// a library synced from one is never saved into another. A repository served from here also says
// which of its folders it holds, so the reader can say why a file was not saved.
export const sourceLocations = (config: SourceConfig) => {
  if (config.kind === 'remote') return [{ name: config.name, url: config.url }]
  return config.projects.map(project => {
    const location = {
      name: project.name,
      url: projectUrl(project),
      scope: { include: config.include, exclude: config.exclude },
    }
    if (config.kind === 'worktree')
      return { ...location, ...writableAt(resolve(config.dir, project.folder)) }
    if (!config.push) return location
    return {
      ...location,
      ...writableAt(project.folder ? `${config.repo}\n${project.folder}` : config.repo),
    }
  })
}
