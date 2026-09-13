import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export type ImageLightboxImage = {
  key: string
  name: string
  load: () => Promise<Blob | undefined>
}

export type ImageLightboxNavigation = {
  index: number
  total: number
  onPrevious?: () => void
  onNext?: () => void
}

export type ImageLightboxProps = {
  image: ImageLightboxImage
  navigation?: ImageLightboxNavigation
  onOpen?: () => void
  onClose: () => void
}

type ImageLoadState = { status: 'loading' } | { status: 'ready'; url: string } | { status: 'error' }

const useImageObjectUrl = (image: ImageLightboxImage) => {
  const [state, setState] = useState<ImageLoadState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    let objectUrl: string | undefined
    setState({ status: 'loading' })
    void image
      .load()
      .then(blob => {
        if (!active) return
        if (!blob) {
          setState({ status: 'error' })
          return
        }
        objectUrl = URL.createObjectURL(blob)
        setState({ status: 'ready', url: objectUrl })
      })
      .catch(error => {
        if (!active) return
        console.error(`Unable to load image attachment: ${image.name}`, error)
        setState({ status: 'error' })
      })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [image])

  return state
}

const ImageNavigation = ({ navigation }: { navigation: ImageLightboxNavigation | undefined }) => {
  if (!navigation || navigation.total <= 1) return null
  return (
    <>
      <button
        type="button"
        className="icon-button image-lightbox-navigation previous"
        aria-label="Previous image"
        disabled={!navigation.onPrevious}
        onClick={navigation.onPrevious}
      >
        <ChevronLeft size={24} />
      </button>
      <button
        type="button"
        className="icon-button image-lightbox-navigation next"
        aria-label="Next image"
        disabled={!navigation.onNext}
        onClick={navigation.onNext}
      >
        <ChevronRight size={24} />
      </button>
    </>
  )
}

export const ImageLightbox = ({ image, navigation, onOpen, onClose }: ImageLightboxProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const state = useImageObjectUrl(image)

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="image-lightbox"
      aria-label={`Preview ${image.name}`}
      onCancel={event => {
        event.preventDefault()
        onClose()
      }}
      onClick={event => {
        if (
          event.target instanceof HTMLElement &&
          event.target.classList.contains('image-lightbox-stage')
        )
          onClose()
      }}
      onKeyDown={event => {
        const action =
          event.key === 'ArrowLeft'
            ? navigation?.onPrevious
            : event.key === 'ArrowRight'
              ? navigation?.onNext
              : undefined
        if (!action) return
        event.preventDefault()
        event.stopPropagation()
        action()
      }}
    >
      <header className="image-lightbox-toolbar">
        <strong title={image.name}>{image.name}</strong>
        {navigation && navigation.total > 1 && (
          <span className="image-lightbox-position">
            {navigation.index + 1} / {navigation.total}
          </span>
        )}
        <span className="image-lightbox-actions">
          {onOpen && (
            <button
              type="button"
              className="image-lightbox-open"
              onClick={() => {
                onClose()
                onOpen()
              }}
            >
              <ExternalLink size={15} />
              Open in reader
            </button>
          )}
          <button
            type="button"
            className="icon-button"
            aria-label="Close image preview"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </span>
      </header>
      <div className="image-lightbox-stage">
        {state.status === 'loading' && <p role="status">Loading image…</p>}
        {state.status === 'error' && <p role="alert">This image is no longer available.</p>}
        {state.status === 'ready' && <img src={state.url} alt={image.name} />}
        <ImageNavigation navigation={navigation} />
      </div>
    </dialog>
  )
}
