import { type ComponentType, type ReactNode, Suspense, useEffect, useRef, useState } from 'react'
import type { SourceLanguage } from '../../components/source-editor'
import { maximumTextPreviewBytes, type StoredFileMetadata } from '../../core/files'
import type { ReadingPositionProps } from '../../core/reading-position'
import { TextDocumentWorkspace } from './text-document-workspace'
import type { TextReaderComponent } from './text-reader'

type TextFileReaderProps = ReadingPositionProps & {
  document: StoredFileMetadata
  files: readonly StoredFileMetadata[]
  blob: Blob
  active: boolean
  textReader: TextReaderDefinition
}

export type DocumentScopeProps = {
  fileId: string
  children: ReactNode
}

export type TextReaderDefinition = {
  Scope?: ComponentType<DocumentScopeProps>
  Preview: TextReaderComponent
  // Absent for formats that are only read, which then open without a Source view or drafts.
  sourceLanguage?: SourceLanguage
}

export const TextFileReader = ({
  document,
  files,
  blob,
  active,
  defaultPosition,
  onPositionChange,
  textReader: { Preview, sourceLanguage },
}: TextFileReaderProps) => {
  const processedDocument = useRef<{ id: string; revision: number }>(null)
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'ready'; content: string; revision: number }
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
    setState(current => (current.status === 'ready' ? current : { status: 'loading' }))
    void blob.arrayBuffer().then(
      buffer => {
        if (!current) return
        try {
          const content = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
          processedDocument.current = { id: document.id, revision: document.revision }
          setState({
            status: 'ready',
            content,
            revision: document.revision,
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
    return <div className="preview-state">Opening {document.path}…</div>
  if (state.status === 'error')
    return (
      <div className="preview-state error-state">
        <h1>Preview unavailable</h1>
        <p>{state.message}</p>
      </div>
    )
  if (!sourceLanguage)
    return (
      <Suspense fallback={<div className="preview-state">Opening {document.path}…</div>}>
        <Preview
          document={{ ...document, revision: state.revision }}
          content={state.content}
          files={files}
          active={active}
          defaultPosition={defaultPosition}
          onPositionChange={onPositionChange}
        />
      </Suspense>
    )
  return (
    <TextDocumentWorkspace
      document={{ ...document, revision: state.revision }}
      persistedContent={state.content}
      sourceLanguage={sourceLanguage}
      Preview={Preview}
      files={files}
      active={active}
      defaultPosition={defaultPosition}
      onPositionChange={onPositionChange}
    />
  )
}
