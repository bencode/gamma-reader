import { useEffect, useState } from 'react'
import { maximumTextPreviewBytes, type StoredFileMetadata } from '../../core/files'

export const HtmlReader = ({ document, blob }: { document: StoredFileMetadata; blob: Blob }) => {
  const [url, setUrl] = useState('')

  useEffect(() => {
    if (document.size > maximumTextPreviewBytes) return
    const next = URL.createObjectURL(new Blob([blob], { type: 'text/html' }))
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob, document.size])

  if (document.size > maximumTextPreviewBytes)
    return (
      <div className="preview-state error-state">
        <h1>Preview unavailable</h1>
        <p>HTML files over 5 MB are stored but not previewed.</p>
      </div>
    )

  return url ? (
    <iframe
      className="html-preview"
      src={url}
      title={document.name}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
    />
  ) : (
    <div className="preview-state">Opening {document.name}…</div>
  )
}
