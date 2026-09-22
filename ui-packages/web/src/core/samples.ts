import exploreWave from '../assets/samples/explore-wave.lab.md?raw'
import fieldNotes from '../assets/samples/field-notes.docx?inline'
import gettingStarted from '../assets/samples/getting-started.md?raw'
import howGammaReaderWorks from '../assets/samples/how-gamma-reader-works.svg?raw'
import observationLog from '../assets/samples/observation-log.xlsx?inline'
import orbitDemo from '../assets/samples/orbit-demo.p5.js?raw'
import sevenMornings from '../assets/samples/seven-mornings.lab.md?raw'
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
    id: 'field-notes',
    name: 'Field notes.docx',
    mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    content: decodeInlineAsset(fieldNotes),
  },
  {
    id: 'observation-log',
    name: 'Observation log.xlsx',
    mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    content: decodeInlineAsset(observationLog),
  },
  {
    id: 'explore-wave',
    name: 'Explore a wave.lab.md',
    mediaType: 'text/markdown',
    content: exploreWave,
  },
  {
    id: 'seven-mornings',
    name: 'Seven mornings.lab.md',
    mediaType: 'text/markdown',
    content: sevenMornings,
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
