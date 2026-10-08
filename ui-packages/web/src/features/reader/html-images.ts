import { useEffect, useRef, useState } from 'react'
import type { StoredFileMetadata } from '../../core/files'
import { encodeBase64 } from '../../utils/base64'
import { parseHtml, serializeHtml } from '../../utils/html'
import { createMarkdownImageResolver } from './markdown-image-resolver'

// A page runs in a sandboxed frame that cannot reach the library, so each image it names from the
// library is handed in as data, found as a Markdown image would be. A page naming none is
// returned exactly as written.
export const withLibraryImages = async (
  html: string,
  pagePath: string,
  files: readonly StoredFileMetadata[],
) => {
  const resolve = createMarkdownImageResolver(files)
  const page = parseHtml(html)
  const found = await Promise.all(
    [...page.images].map(async image => ({
      image,
      blob: await resolve(image.getAttribute('src') ?? '', pagePath),
    })),
  )
  const local = found.flatMap(({ image, blob }) => (blob ? [{ image, blob }] : []))
  if (local.length === 0) return html
  await Promise.all(
    local.map(async ({ image, blob }) =>
      image.setAttribute('src', `data:${blob.type};base64,${await encodeBase64(blob)}`),
    ),
  )
  return serializeHtml(page)
}

// The address a frame shows a page from. The library is looked at when the page changes rather
// than whenever it reloads, so saving some other file does not restart the page.
export const useHtmlPageUrl = (
  content: string | undefined,
  pagePath: string,
  files: readonly StoredFileMetadata[],
) => {
  const filesRef = useRef(files)
  const [url, setUrl] = useState('')
  useEffect(() => {
    filesRef.current = files
  }, [files])
  useEffect(() => {
    if (content === undefined) return
    let current = true
    let next = ''
    const show = (html: string) => {
      if (!current) return
      next = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
      setUrl(next)
    }
    withLibraryImages(content, pagePath, filesRef.current).then(show, (cause: unknown) => {
      console.error('Unable to load the images of an HTML page', cause)
      show(content)
    })
    return () => {
      current = false
      if (next) URL.revokeObjectURL(next)
    }
  }, [content, pagePath])
  return url
}
