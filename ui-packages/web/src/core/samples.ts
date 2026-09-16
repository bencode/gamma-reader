import exploreWave from '../assets/samples/explore-wave.lab.md?raw'
import gettingStarted from '../assets/samples/getting-started.md?raw'
import howGammaReaderWorks from '../assets/samples/how-gamma-reader-works.svg?raw'
import orbitDemo from '../assets/samples/orbit-demo.p5.js?raw'
import artOfNoticing from '../assets/samples/the-art-of-noticing.pdf?inline'

export type SampleDocument = {
  id: string
  name: string
  mediaType: string
  content: string | ArrayBuffer
}

const decodeInlineAsset = (source: string) => {
  const separator = source.indexOf(',')
  const header = source.slice(0, separator)
  if (separator < 0 || !header.endsWith(';base64'))
    throw new Error('Expected an inline Base64 sample asset.')
  const binary = atob(source.slice(separator + 1))
  const bytes = new Uint8Array(binary.length)
  Array.from(binary).forEach((character, index) => {
    bytes[index] = character.charCodeAt(0)
  })
  return bytes.buffer
}

export const samples: SampleDocument[] = [
  {
    id: 'getting-started',
    name: 'Start here.md',
    mediaType: 'text/markdown',
    content: gettingStarted,
  },
  {
    id: 'art-of-noticing',
    name: 'The art of noticing.pdf',
    mediaType: 'application/pdf',
    content: decodeInlineAsset(artOfNoticing),
  },
  {
    id: 'explore-wave',
    name: 'Explore a wave.lab.md',
    mediaType: 'text/markdown',
    content: exploreWave,
  },
  {
    id: 'orbit-demo',
    name: 'Orbit.p5.js',
    mediaType: 'text/javascript',
    content: orbitDemo,
  },
  {
    id: 'how-gamma-reader-works',
    name: 'How Gamma Reader works.svg',
    mediaType: 'image/svg+xml',
    content: howGammaReaderWorks,
  },
]
