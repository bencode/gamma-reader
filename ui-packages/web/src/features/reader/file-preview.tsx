import { lazy, Suspense, useEffect, useState } from 'react'
import { formatBytes, type StoredFileMetadata } from '../../core/files'
import { getStoredFileContent } from '../../data/file-store'
import type { Workspace } from '../../shell/use-workspace'
import { HtmlReader } from './html-reader'
import { ImageReader } from './image-reader'
import { TextFileReader } from './text-file-reader'

const PdfReader = lazy(() => import('./pdf-reader').then(module => ({ default: module.PdfReader })))

type FilePreviewProps = {
  document: StoredFileMetadata
  active: boolean
  scrollPositions: Workspace['scrollPositions']
  onQuote: (documentId: string, text: string) => void
}

type ContentState =
  | { status: 'idle' }
  | { status: 'ready'; id: string; revision: number; blob: Blob }
  | { status: 'error'; id: string; revision: number }

export const FilePreview = ({ document, active, scrollPositions, onQuote }: FilePreviewProps) => {
  const [state, setState] = useState<ContentState>({ status: 'idle' })

  useEffect(() => {
    if (!active || document.previewKind === 'unsupported') return
    let current = true
    void getStoredFileContent(document.id).then(
      blob => {
        if (!current) return
        if (blob) setState({ status: 'ready', id: document.id, revision: document.revision, blob })
        else {
          console.error('Stored file content is missing', document.id)
          setState({ status: 'error', id: document.id, revision: document.revision })
        }
      },
      error => {
        if (!current) return
        console.error('Unable to load stored file content', error)
        setState({ status: 'error', id: document.id, revision: document.revision })
      },
    )
    return () => {
      current = false
    }
  }, [active, document.id, document.previewKind, document.revision])

  if (document.previewKind === 'unsupported')
    return (
      <div className="preview-state unavailable-preview">
        <h1>Preview unavailable</h1>
        <p>{document.name}</p>
        <span>{formatBytes(document.size)}</span>
        <p>This file is stored locally and can be used as context in a later iteration.</p>
      </div>
    )

  if (state.status === 'error' && state.id === document.id && state.revision === document.revision)
    return (
      <div className="preview-state error-state">
        <h1>File unavailable</h1>
        <p>The browser copy could not be opened. Remove it and import the file again.</p>
      </div>
    )

  if (state.status !== 'ready' || state.id !== document.id || state.revision !== document.revision)
    return <div className="preview-state">Opening {document.name}…</div>

  if (document.previewKind === 'image') return <ImageReader document={document} blob={state.blob} />
  if (document.previewKind === 'html') return <HtmlReader document={document} blob={state.blob} />
  if (document.previewKind === 'pdf')
    return (
      <Suspense fallback={<div className="preview-state">Preparing PDF preview…</div>}>
        <PdfReader
          key={`${document.id}:${document.revision}`}
          document={document}
          blob={state.blob}
          active={active}
          onQuote={onQuote}
        />
      </Suspense>
    )
  return (
    <TextFileReader
      document={document}
      blob={state.blob}
      active={active}
      scrollPositions={scrollPositions}
      onQuote={onQuote}
    />
  )
}
