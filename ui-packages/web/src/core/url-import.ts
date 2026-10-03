// An address the library can add from: one file the browser downloads, or a GitHub folder read
// file by file.
export type ImportTarget =
  | { kind: 'file'; url: string; name: string }
  | {
      kind: 'repository'
      owner: string
      repo: string
      ref: string
      subpath: string
      name: string
    }

const segmentsOf = (url: URL) => url.pathname.split('/').filter(Boolean)

// A segment with a broken escape names nothing the library could store.
const decoded = (segment: string) => {
  try {
    return decodeURIComponent(segment)
  } catch (cause) {
    if (cause instanceof URIError) return null
    throw cause
  }
}

const fileName = (segment: string | undefined) => (segment ? decoded(segment) || null : null)

// New identifiers such as 1706.03762v7, and old ones such as hep-th/9901001.
const arxivId = /^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[a-z]{2})?\/\d{7})(?:v\d+)?$/i

// An abstract page stands for its paper's PDF.
const fromArxiv = (url: URL): ImportTarget | null => {
  const [kind, ...rest] = segmentsOf(url)
  const id = rest.join('/').replace(/\.pdf$/i, '')
  if ((kind !== 'abs' && kind !== 'pdf') || !arxivId.test(id)) return null
  return { kind: 'file', url: `https://arxiv.org/pdf/${id}`, name: `${id.replace('/', '_')}.pdf` }
}

// A ref containing a slash cannot be told apart from the path after it, so the first segment
// is taken as the ref.
const fromGithub = (url: URL): ImportTarget | null => {
  const [owner, rawRepo, view, ref, ...path] = segmentsOf(url)
  const repo = rawRepo?.replace(/\.git$/, '')
  if (!owner || !repo) return null
  if (view === 'blob' && ref && path.length) {
    const name = fileName(path.at(-1))
    return name
      ? {
          kind: 'file',
          url: `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path.join('/')}`,
          name,
        }
      : null
  }
  if (view !== undefined && !(view === 'tree' && ref)) return null
  const subpath = path.map(decoded)
  if (subpath.some(segment => segment === null)) return null
  return {
    kind: 'repository',
    owner,
    repo,
    ref: ref ?? 'HEAD',
    subpath: subpath.join('/'),
    name: repo,
  }
}

// Any other address is fetched by the browser as it is, which works where the site allows it.
const fromAddress = (url: URL): ImportTarget | null =>
  url.protocol === 'https:'
    ? { kind: 'file', url: url.href, name: fileName(segmentsOf(url).at(-1)) ?? url.hostname }
    : null

export const resolveImportUrl = (text: string): ImportTarget | null => {
  const url = URL.parse(text.trim())
  if (url?.protocol !== 'https:' && url?.protocol !== 'http:') return null
  const host = url.hostname.replace(/^www\./, '')
  if (host === 'arxiv.org') return fromArxiv(url) ?? fromAddress(url)
  if (host === 'github.com') return fromGithub(url)
  return fromAddress(url)
}
