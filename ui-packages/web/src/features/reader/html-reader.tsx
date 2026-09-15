import { Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { TextReaderProps } from './text-file-reader'

export const HtmlReader = ({ document, content }: TextReaderProps) => {
  const [runningContent, setRunningContent] = useState(content)
  const [url, setUrl] = useState('')
  const changesPending = content !== runningContent

  useEffect(() => {
    const next = URL.createObjectURL(new Blob([runningContent], { type: 'text/html' }))
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [runningContent])

  return (
    <div className="reader-content html-reader">
      <div className="preview-toolbar html-toolbar" role="toolbar" aria-label="HTML controls">
        <button
          type="button"
          className={changesPending ? 'toolbar-button active' : 'toolbar-button'}
          disabled={!changesPending}
          onClick={() => setRunningContent(content)}
        >
          <Play size={14} />
          Run changes
        </button>
      </div>
      {url ? (
        <iframe
          className="html-preview"
          src={url}
          title={document.name}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="preview-state">Opening {document.name}…</div>
      )}
    </div>
  )
}
