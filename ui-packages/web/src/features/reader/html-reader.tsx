import { Play } from 'lucide-react'
import { useState } from 'react'
import { useHtmlPageUrl } from './html-images'
import type { TextReaderProps } from './text-reader'

export const HtmlReader = ({ document, content, files }: TextReaderProps) => {
  const [runningContent, setRunningContent] = useState(content)
  const url = useHtmlPageUrl(runningContent, document.path, files)
  const changesPending = content !== runningContent

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
          title={document.path}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="preview-state">Opening {document.path}…</div>
      )}
    </div>
  )
}
