import { useEffect, useRef, useState } from 'react'
import type { StoredFileMetadata } from '../../core/files'
import { encodeBase64 } from '../../utils/base64'
import { parseHtml, serializeHtml } from '../../utils/html'
import { createMarkdownImageResolver } from './markdown-image-resolver'

// The sandbox keeps the browser from following a link within the page, so a page that has one is
// given this to scroll there instead, unless the page handled the click itself.
const inPageLinks = `document.addEventListener('click', event => {
  const link = event.target instanceof Element ? event.target.closest('a[href^="#"], area[href^="#"]') : null
  if (!link || event.defaultPrevented) return
  event.preventDefault()
  const id = decodeURIComponent(link.getAttribute('href').slice(1))
  const place = document.getElementById(id) ?? document.getElementsByName(id)[0]
  if (place) place.scrollIntoView()
  else if (id === '' || id.toLowerCase() === 'top') window.scrollTo(0, 0)
})`

// A page runs in a sandboxed frame that cannot reach the library, so each image it names from the
// library is handed in as data, found as a Markdown image would be. A link to the web opens in a
// new tab, as one in a note does, instead of taking the frame away from the page, and a link
// within the page scrolls to its place. A page needing none of this is returned exactly as
// written.
export const framePage = async (
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
  const links = [
    ...page.querySelectorAll<HTMLAnchorElement | HTMLAreaElement>('a[href], area[href]'),
  ].filter(link => /^https?:\/\//i.test(link.getAttribute('href') ?? ''))
  const withinPage = page.querySelector('a[href^="#"], area[href^="#"]') !== null
  if (local.length === 0 && links.length === 0 && !withinPage) return html
  for (const link of links) {
    link.setAttribute('target', '_blank')
    link.setAttribute('rel', 'noopener noreferrer')
  }
  if (withinPage) {
    const script = page.createElement('script')
    script.textContent = inPageLinks
    page.body.append(script)
  }
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
    framePage(content, pagePath, filesRef.current).then(show, (cause: unknown) => {
      console.error('Unable to prepare an HTML page for its frame', cause)
      show(content)
    })
    return () => {
      current = false
      if (next) URL.revokeObjectURL(next)
    }
  }, [content, pagePath])
  return url
}
