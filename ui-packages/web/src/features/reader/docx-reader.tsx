import { useEffect, useRef, useState } from 'react'
import type { MarkdownImageResolver } from '../../components/markdown-image'
import { convertDocxToMarkdown, reportDocxMessages } from '../../core/docx'
import type { StoredFileMetadata } from '../../core/files'
import type { Workspace } from '../../shell/use-workspace'
import { StandardMarkdownReader } from './markdown-reader/standard-reader'

type DocxReaderProps = {
  document: StoredFileMetadata
  blob: Blob
  files: readonly StoredFileMetadata[]
  active: boolean
  scrollPositions: Workspace['scrollPositions']
}

type ConversionState =
  | { status: 'loading' }
  | { status: 'ready'; content: string; resolveImage: MarkdownImageResolver }
  | { status: 'error'; message: string }

// Settling into a single state object keeps the image resolver stable across re-runs.
const convertDocument = (blob: Blob, name: string): Promise<ConversionState> =>
  convertDocxToMarkdown(blob).then(
    ({ markdown, images, messages }) => {
      reportDocxMessages(name, messages)
      return {
        status: 'ready',
        content: markdown,
        resolveImage: async reference => images.get(reference) ?? null,
      }
    },
    error => {
      console.error('Unable to read Word document', error)
      return {
        status: 'error',
        message: 'This document could not be read. Only .docx files are supported.',
      }
    },
  )

export const DocxReader = ({ document, blob, files, active, scrollPositions }: DocxReaderProps) => {
  // Converting is expensive, and both StrictMode and reopening a tab ask for the same document again.
  const conversion = useRef<{ id: string; revision: number; result: Promise<ConversionState> }>(
    null,
  )
  const [state, setState] = useState<ConversionState>({ status: 'loading' })

  useEffect(() => {
    const cached = conversion.current
    const pending =
      cached?.id === document.id && cached.revision === document.revision
        ? cached
        : {
            id: document.id,
            revision: document.revision,
            result: convertDocument(blob, document.name),
          }
    if (pending !== cached) {
      conversion.current = pending
      setState({ status: 'loading' })
    }
    let current = true
    void pending.result.then(result => {
      if (current) setState(result)
    })
    return () => {
      current = false
    }
  }, [blob, document.id, document.name, document.revision])

  if (state.status === 'loading')
    return <div className="preview-state">Opening {document.name}…</div>
  if (state.status === 'error')
    return (
      <div className="preview-state error-state">
        <h1>Preview unavailable</h1>
        <p>{state.message}</p>
      </div>
    )
  return (
    <StandardMarkdownReader
      document={document}
      content={state.content}
      files={files}
      active={active}
      scrollPositions={scrollPositions}
      imageResolver={state.resolveImage}
    />
  )
}
