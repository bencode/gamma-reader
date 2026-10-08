import type { ComponentType } from 'react'
import type { MarkdownImageResolver } from '../../components/markdown-image'
import type { StoredFileMetadata } from '../../core/files'
import type { ReadingPositionProps } from '../../core/reading-position'

// What every reader of a text format is given, and the shape of one: the contract between the
// file reader that loads the text and the readers that show it.
export type TextReaderProps = ReadingPositionProps & {
  document: StoredFileMetadata
  content: string
  files: readonly StoredFileMetadata[]
  active: boolean
  // Formats converted to Markdown carry their own images rather than workspace files.
  imageResolver?: MarkdownImageResolver
}

export type TextReaderComponent = ComponentType<TextReaderProps>
