import { Maximize2, Minus, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { StoredFileMetadata } from '../../core/files'

export const ImageReader = ({ document, blob }: { document: StoredFileMetadata; blob: Blob }) => {
  const [url, setUrl] = useState('')
  const [fit, setFit] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [naturalWidth, setNaturalWidth] = useState(0)

  useEffect(() => {
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])

  const changeZoom = (next: number) => {
    setFit(false)
    setZoom(Math.max(0.25, Math.min(next, 4)))
  }

  return (
    <div className="media-reader">
      <div className="preview-toolbar" role="toolbar" aria-label="Image controls">
        <button
          type="button"
          className="icon-button"
          aria-label="Zoom out"
          onClick={() => changeZoom(zoom - 0.25)}
        >
          <Minus size={15} />
        </button>
        <button type="button" className="toolbar-value" onClick={() => changeZoom(1)}>
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Zoom in"
          onClick={() => changeZoom(zoom + 0.25)}
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          className={fit ? 'toolbar-button active' : 'toolbar-button'}
          aria-pressed={fit}
          onClick={() => setFit(true)}
        >
          <Maximize2 size={14} /> Fit
        </button>
      </div>
      <div className="media-scroll">
        {url && (
          <img
            src={url}
            alt={document.name}
            className={fit ? 'preview-image fit' : 'preview-image'}
            style={fit || naturalWidth === 0 ? undefined : { width: naturalWidth * zoom }}
            onLoad={event => setNaturalWidth(event.currentTarget.naturalWidth)}
          />
        )}
      </div>
    </div>
  )
}
