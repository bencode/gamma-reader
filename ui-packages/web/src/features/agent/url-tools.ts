import { Type } from '@earendil-works/pi-ai'
import type { StoredFileMetadata } from '../../core/files'
import { resolveImportUrl } from '../../core/url-import'
import { downloadFile, RemoteFileError } from '../../data/remote-files'
import { bind } from './tool'
import { LocalToolError } from './tool-types'
import { refusal } from './web-tools'

type FileSaver = (path: string, file: File, signal?: AbortSignal) => Promise<StoredFileMetadata>

// Whether a page the browser may not download can be saved as its text instead: only while the
// reader has web search on, and only where the server can search the web at all.
export type WebState = 'on' | 'off' | 'unavailable'

type ExtractedPage = { url: string; title?: string; content: string }

const extractPage = async (url: string, signal?: AbortSignal): Promise<ExtractedPage> => {
  const response = await fetch('/api/agent/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
    signal,
  })
  if (!response.ok) throw new LocalToolError(await refusal(response))
  return (await response.json()) as ExtractedPage
}

const turnOnWebSearch =
  'This site does not let the browser download it. With web search on, the page text can be saved as Markdown; ask the reader to turn it on.'

// A name the library accepts, from a page title or a host.
const fileStem = (text: string) =>
  text
    .replace(/[\\/:*?"<>|\p{Cc}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim() || 'page'

const pageTitle = (content: string) => content.match(/^#\s+(.+)$/m)?.[1]

const pageFile = (page: ExtractedPage, path: string | undefined, savedOn: Date) => {
  const title = page.title ?? pageTitle(page.content) ?? new URL(page.url).hostname
  const name = path ?? `${fileStem(title)}.md`
  const text = `> Saved from <${page.url}> on ${savedOn.toISOString().slice(0, 10)}.\n\n${page.content}`
  return { path: name, file: new File([text], name, { type: 'text/markdown' }) }
}

const savedResult = (metadata: StoredFileMetadata, saved: 'file' | 'page-text') => ({
  fileId: metadata.id,
  path: metadata.path,
  saved,
  mediaType: metadata.mediaType,
})

export const createUrlTools = (save: FileSaver, web: () => WebState) => [
  bind(
    'save_from_url',
    'Save a file or web page from a URL into the workspace, only when the reader asks to save it. A file the browser can download (a PDF, an image, an arXiv paper, a GitHub file) is saved as it is; a web page is saved as Markdown text when web search is on. path is an optional workspace path such as papers/attention.pdf; an existing file is never replaced. Returns the fileId to read.',
    Type.Object({
      url: Type.String({ minLength: 1 }),
      path: Type.Optional(Type.String({ minLength: 1 })),
    }),
    async ({ url, path }, signal) => {
      const target = resolveImportUrl(url)
      if (!target) throw new LocalToolError('Use an http or https address.')
      if (target.kind === 'repository')
        throw new LocalToolError(
          'A GitHub folder cannot be saved here. Ask the reader to add it with Add from URL in Files.',
        )
      let downloaded: File | null = null
      let blocked = ''
      try {
        downloaded = await downloadFile(target)
      } catch (cause) {
        if (!(cause instanceof RemoteFileError)) throw cause
        // Only a site the browser could not read is worth asking Tavily for; one that answered
        // with an error status would answer it the same way.
        if (!(cause.cause instanceof TypeError)) throw new LocalToolError(cause.message)
        blocked = cause.message
      }
      signal?.throwIfAborted()
      if (downloaded && downloaded.type !== 'text/html')
        return savedResult(await save(path ?? target.name, downloaded, signal), 'file')
      const state = web()
      if (state === 'on') {
        const page = pageFile(await extractPage(target.url, signal), path, new Date())
        return savedResult(await save(page.path, page.file, signal), 'page-text')
      }
      if (!downloaded) throw new LocalToolError(state === 'off' ? turnOnWebSearch : blocked)
      // A page the browser could read, kept as it came while its text cannot be extracted.
      const name = path ?? (/\.html?$/i.test(target.name) ? target.name : `${target.name}.html`)
      return savedResult(await save(name, downloaded, signal), 'file')
    },
  ),
]
