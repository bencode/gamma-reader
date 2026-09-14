import { type ComponentType, Suspense, useEffect, useRef, useState } from 'react'
import { maximumTextPreviewBytes, type StoredFileMetadata } from '../../core/files'
import type { Workspace } from '../../shell/use-workspace'
import { MarkdownReader } from './markdown-reader'

type TextFileReaderProps = {
  document: StoredFileMetadata
  files: readonly StoredFileMetadata[]
  blob: Blob
  active: boolean
  scrollPositions: Workspace['scrollPositions']
  textReader?: TextReaderComponent
}

export type TextReaderProps = {
  document: StoredFileMetadata
  content: string
  active: boolean
}

export type TextReaderComponent = ComponentType<TextReaderProps>

export const TextFileReader = ({
  document,
  files,
  blob,
  active,
  scrollPositions,
  textReader,
}: TextFileReaderProps) => {
  const processedDocument = useRef<{ id: string; revision: number }>(null)
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'ready'; content: string }
    | { status: 'error'; message: string }
  >({ status: 'loading' })

  useEffect(() => {
    if (
      processedDocument.current?.id === document.id &&
      processedDocument.current.revision === document.revision
    )
      return
    if (document.size > maximumTextPreviewBytes) {
      processedDocument.current = { id: document.id, revision: document.revision }
      setState({ status: 'error', message: 'Text files over 5 MB are stored but not previewed.' })
      return
    }
    let current = true
    setState({ status: 'loading' })
    void blob.arrayBuffer().then(
      buffer => {
        if (!current) return
        try {
          const content = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
          processedDocument.current = { id: document.id, revision: document.revision }
          setState({
            status: 'ready',
            content,
          })
        } catch (error) {
          console.error('Unable to decode text file', error)
          processedDocument.current = { id: document.id, revision: document.revision }
          setState({ status: 'error', message: 'This text file is not valid UTF-8.' })
        }
      },
      error => {
        if (!current) return
        console.error('Unable to read text file', error)
        processedDocument.current = { id: document.id, revision: document.revision }
        setState({ status: 'error', message: 'This text file could not be read.' })
      },
    )
    return () => {
      current = false
    }
  }, [blob, document.id, document.revision, document.size])

  if (state.status === 'loading')
    return <div className="preview-state">Opening {document.name}…</div>
  if (state.status === 'error')
    return (
      <div className="preview-state error-state">
        <h1>Preview unavailable</h1>
        <p>{state.message}</p>
      </div>
    )
  if (textReader) {
    const Reader = textReader
    return (
      <Suspense fallback={<div className="preview-state">Preparing {document.name}…</div>}>
        <Reader
          key={`${document.id}:${document.revision}`}
          document={document}
          content={state.content}
          active={active}
        />
      </Suspense>
    )
  }
  return (
    <MarkdownReader
      document={document}
      content={state.content}
      files={files}
      markdown={document.previewKind === 'markdown'}
      active={active}
      scrollPositions={scrollPositions}
    />
  )
}
