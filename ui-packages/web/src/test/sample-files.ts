import exploreWave from '../../../../tutorial/Explore a wave.lab.md?raw'
import fieldNotes from '../../../../tutorial/Field notes.docx?inline'
import howGammaReaderWorks from '../../../../tutorial/How Gamma Reader works.svg?raw'
import observationLog from '../../../../tutorial/Observation log.xlsx?inline'
import orbitDemo from '../../../../tutorial/Orbit.p5.js?raw'
import sevenMornings from '../../../../tutorial/Seven mornings.lab.md?raw'
import gettingStarted from '../../../../tutorial/Start here.md?raw'
import artOfNoticing from '../../../../tutorial/The art of noticing.pdf?inline'
import { previewKindFor } from '../core/files'
import { openWorkspaceDatabase } from '../data/workspace-database'

const decodeInlineAsset = (source: string) => {
  const binary = atob(source.slice(source.indexOf(',') + 1))
  return Uint8Array.from(binary, character => character.charCodeAt(0)).buffer
}

// The files a library held when the reader still seeded one, which many tests read and open.
export const samples = [
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
  { id: 'orbit-demo', name: 'Orbit.p5.js', mediaType: 'text/javascript', content: orbitDemo },
  {
    id: 'how-gamma-reader-works',
    name: 'How Gamma Reader works.svg',
    mediaType: 'image/svg+xml',
    content: howGammaReaderWorks,
  },
]

// Writes those files into the current library, under the ids tests refer to them by.
export const seedSampleFiles = async () => {
  const database = await openWorkspaceDatabase()
  const transaction = database.transaction(['files', 'contents'], 'readwrite')
  samples.forEach((sample, index) => {
    const blob = new Blob([sample.content], { type: sample.mediaType })
    void transaction.objectStore('files').put({
      id: sample.id,
      path: sample.name,
      collection: 'files',
      mediaType: blob.type,
      previewKind: previewKindFor(sample.name, blob.type),
      size: blob.size,
      lastModified: 0,
      createdAt: index,
      revision: 1,
    })
    void transaction.objectStore('contents').put({ id: sample.id, blob })
  })
  await transaction.done
}
