import { headingKey, type LinkTarget } from '@gamma-reader/links'
import { createContext, useContext } from 'react'
import type { Components } from 'react-markdown'
import type { StoredFileMetadata } from '../../../core/files'

// Where an embed stands: the places shown around it, from the note being read inward, so one that
// would show itself again is caught; how deep it is; and what it renders with.
export type EmbedScope = {
  chain: readonly string[]
  depth: number
  files: readonly StoredFileMetadata[]
  components: Components
}

export const EmbedScopeContext = createContext<EmbedScope | null>(null)

export const useEmbedScope = () => useContext(EmbedScopeContext)

// A place as an embed chain names it: a file, and the block or section within it, if any.
export const placeKey = (fileId: string, target: Pick<LinkTarget, 'block' | 'heading'>) =>
  `${fileId}#${target.block ? `^${target.block}` : target.heading ? headingKey(target.heading) : ''}`
