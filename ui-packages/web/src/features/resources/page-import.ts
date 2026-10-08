import { type ImportSource, isWorkspacePath, rootSources } from '../../core/files'
import type { ImportTarget } from '../../core/url-import'
import { fetchRemoteBlob, fetchRemoteFile, RemoteFileError } from '../../data/remote-files'
import { parseHtml, serializeHtml } from '../../utils/html'
import { mapWithLimit } from '../../utils/map-with-limit'
import { containsControlCharacter } from '../../utils/path'
import { decodeUtf8 } from '../../utils/text'

type SavedImage = { name: string; blob: Blob }

const pageBase = (page: Document, url: string) =>
  URL.parse(page.querySelector('base[href]')?.getAttribute('href') ?? '', url)?.href ?? url

const imageAddress = (image: HTMLImageElement, base: string) => {
  const src = image.getAttribute('src')?.trim()
  const address = src ? URL.parse(src, base) : null
  if (address?.protocol !== 'https:' && address?.protocol !== 'http:') return null
  address.hash = ''
  return address.href
}

// An image the site refuses, or a reply that is not an image, stays on the web.
const fetchImage = async (address: string) => {
  try {
    const blob = await fetchRemoteBlob(address)
    if (blob.type.startsWith('image/')) return blob
    console.warn(`Left ${address} on the web: the site answered with ${blob.type || 'no type'}`)
    return null
  } catch (cause) {
    if (!(cause instanceof RemoteFileError)) throw cause
    console.warn(`Left ${address} on the web: it could not be downloaded`, cause)
    return null
  }
}

const decodedName = (address: string) => {
  const segment = new URL(address).pathname.split('/').at(-1) ?? ''
  try {
    const name = decodeURIComponent(segment)
    return isWorkspacePath(name) && !name.includes('/') && !containsControlCharacter(name)
      ? name
      : null
  } catch (cause) {
    if (cause instanceof URIError) return null
    throw cause
  }
}

const withExtension = (name: string, type: string) => {
  if (/\.[^.]+$/.test(name)) return name
  const subtype = type.split(';')[0]?.split('/')[1] ?? ''
  return `${name}.${subtype === 'svg+xml' ? 'svg' : subtype}`
}

// Images from different folders may share a name, so a later one is numbered: fig.gif, fig-2.gif.
const uniqueName = (name: string, taken: Set<string>) => {
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const extension = dot > 0 ? name.slice(dot) : ''
  let candidate = name
  for (let number = 2; taken.has(candidate.toLowerCase()); number++)
    candidate = `${stem}-${number}${extension}`
  taken.add(candidate.toLowerCase())
  return candidate
}

// A srcset or a <picture> source would be chosen over src, so only src is left to point.
const pointImage = (image: HTMLImageElement, src: string) => {
  image.setAttribute('src', src)
  image.removeAttribute('srcset')
  image.removeAttribute('sizes')
  if (image.parentElement?.tagName === 'PICTURE')
    for (const source of image.parentElement.querySelectorAll(':scope > source')) source.remove()
}

// A web page comes in as a folder holding the page and, under images/, the images it shows, so
// the page reads offline and its text stays free of image data. Any other file, a page with no
// image to keep, or a page that is not UTF-8 comes in as it was served.
export const downloadPage = async (
  target: Extract<ImportTarget, { kind: 'file' }>,
  onProgress: (done: number, total: number) => void,
): Promise<ImportSource[]> => {
  const { file, url } = await fetchRemoteFile(target)
  const html = file.type === 'text/html' ? decodeUtf8(await file.arrayBuffer()) : null
  if (html === null) return rootSources([file])
  const page = parseHtml(html)
  const base = pageBase(page, url)
  const images = [...page.images].flatMap(image => {
    const address = imageAddress(image, base)
    return address ? [{ image, address }] : []
  })
  const addresses = [...new Set(images.map(({ address }) => address))]
  let done = 0
  const blobs = await mapWithLimit(addresses, 6, async address => {
    const blob = await fetchImage(address)
    done += 1
    onProgress(done, addresses.length)
    return blob
  })
  const taken = new Set<string>()
  const saved = new Map<string, SavedImage>()
  addresses.forEach((address, index) => {
    const blob = blobs[index]
    if (!blob) return
    const name = withExtension(decodedName(address) ?? `image-${index + 1}`, blob.type)
    saved.set(address, { name: uniqueName(name, taken), blob })
  })
  if (saved.size === 0) return rootSources([file])
  for (const { image, address } of images) {
    const local = saved.get(address)
    pointImage(image, local ? `images/${encodeURIComponent(local.name)}` : address)
  }
  const stem = target.name.replace(/\.html?$/i, '')
  return [
    {
      path: `${stem}/${stem}.html`,
      file: new File([serializeHtml(page)], `${stem}.html`, { type: 'text/html' }),
    },
    ...[...saved.values()].map(({ name, blob }) => ({
      path: `${stem}/images/${name}`,
      file: new File([blob], name, { type: blob.type }),
    })),
  ]
}
