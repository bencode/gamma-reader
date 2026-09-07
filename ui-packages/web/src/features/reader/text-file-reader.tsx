import { useEffect, useState } from 'react'
import { maximumTextPreviewBytes, type StoredFileMetadata } from '../../core/files'
import type { Workspace } from '../../shell/use-workspace'
import { MarkdownReader } from './markdown-reader'

type TextFileReaderProps = {
  document: StoredFileMetadata
  blob: Blob
  active: boolean
  scrollPositions: Workspace['scrollPositions']
  onQuote: (documentId: string, text: string) => void
}

export const TextFileReader = ({
  document,
  blob,
  active,
  scrollPositions,
  onQuote,
}: TextFileReaderProps) => {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'ready'; content: string }
    | { status: 'error'; message: string }
  >({ status: 'loading' })

  useEffect(() => {
    if (document.size > maximumTextPreviewBytes) {
      setState({ status: 'error', message: 'Text files over 5 MB are stored but not previewed.' })
      return
    }
    let current = true
    setState({ status: 'loading' })
    void blob.arrayBuffer().then(
      buffer => {
        if (!current) return
        try {
          setState({
            status: 'ready',
            content: new TextDecoder('utf-8', { fatal: true }).decode(buffer),
          })
        } catch (error) {
          console.error('Unable to decode text file', error)
          setState({ status: 'error', message: 'This text file is not valid UTF-8.' })
        }
      },
      error => {
        if (!current) return
        console.error('Unable to read text file', error)
        setState({ status: 'error', message: 'This text file could not be read.' })
      },
    )
    return () => {
      current = false
    }
  }, [blob, document.size])

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
    <MarkdownReader
      document={document}
      content={state.content}
      markdown={document.previewKind === 'markdown'}
      active={active}
      scrollPositions={scrollPositions}
      onQuote={onQuote}
    />
  )
}
