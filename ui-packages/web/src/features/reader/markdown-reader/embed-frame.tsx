import { type EmbedSize, formatSize } from '@gamma-reader/links'
import {
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react'
import { P5Reader } from '../../../components/p5-reader'
import { decodeUtf8 } from '../../../core/document-text'
import type { StoredFileMetadata } from '../../../core/files'
import { getStoredFileContent } from '../../../data/file-store'
import styles from './style.module.scss'

const minimumSize = { width: 120, height: 80 }

// Where a drag began, and the size it has reached, if it has moved at all.
type Drag = { x: number; y: number; width: number; height: number; reached?: EmbedSize }

// The box an embed is shown in: at the size written for it, else the size it has of its own, and
// resized by a drag on its corner when the note can take the new size. Content that keeps its
// shape follows the drag in width alone. A size dragged to holds until the note's size changes.
export const ResizableBox = ({
  size,
  fallback,
  ratio,
  axis,
  className,
  onResize,
  children,
}: {
  size?: EmbedSize
  fallback?: EmbedSize
  ratio?: number
  axis: 'width' | 'both'
  className?: string
  onResize?: (size: EmbedSize) => void
  children: ReactNode
}) => {
  const boxRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const written = size ? formatSize(size) : ''
  const [dragged, setDragged] = useState<{ over: string; size: EmbedSize } | null>(null)
  const shown = (dragged && dragged.over === written ? dragged.size : size) ?? fallback

  const start = (event: PointerEvent<HTMLSpanElement>) => {
    const box = boxRef.current?.getBoundingClientRect()
    if (!box) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, y: event.clientY, width: box.width, height: box.height }
  }
  const move = (event: PointerEvent<HTMLSpanElement>) => {
    const from = drag.current
    if (!from) return
    const width = Math.round(Math.max(minimumSize.width, from.width + event.clientX - from.x))
    const height = Math.round(Math.max(minimumSize.height, from.height + event.clientY - from.y))
    from.reached = axis === 'both' ? { width, height } : { width }
    setDragged({ over: written, size: from.reached })
  }
  const end = () => {
    const reached = drag.current?.reached
    drag.current = null
    if (reached) onResize?.(reached)
  }

  return (
    <div
      ref={boxRef}
      className={className}
      style={{
        width: shown ? `${shown.width}px` : undefined,
        height: shown?.height ? `${shown.height}px` : undefined,
        aspectRatio: !shown?.height && ratio ? String(ratio) : undefined,
      }}
    >
      {children}
      {onResize && (
        <span
          className={styles.resizeHandle}
          aria-hidden="true"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
      )}
    </div>
  )
}

type FileText = { revision: number; text: string } | { revision: number; text: null }

// A file's saved text, read again with each save; null when it cannot be read.
const useFileText = (file: StoredFileMetadata) => {
  const [read, setRead] = useState<FileText | null>(null)
  useEffect(() => {
    let current = true
    const { id, revision } = file
    getStoredFileContent(id)
      .then(async blob => {
        const text = blob ? decodeUtf8(await blob.arrayBuffer()) : null
        if (current) setRead({ revision, text })
      })
      .catch((cause: unknown) => {
        console.error('Unable to read an embedded file', cause)
        if (current) setRead({ revision, text: null })
      })
    return () => {
      current = false
    }
  }, [file])
  return read
}

// Whether the element is on screen, so a sketch scrolled away stops drawing.
const useOnScreen = (ref: RefObject<HTMLElement | null>) => {
  const [onScreen, setOnScreen] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(([entry]) =>
      setOnScreen(entry?.isIntersecting ?? false),
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return onScreen
}

type FrameProps = {
  file: StoredFileMetadata
  name: string
  size?: EmbedSize
  onResize?: (size: EmbedSize) => void
}

const unreadable = (name: string) => <p className={styles.embedNote}>{name} could not be read.</p>

// A p5 sketch in place, as large as its canvas unless a size is written, drawing while on screen
// and started again with each save.
export const EmbeddedSketch = ({ file, name, size, onResize }: FrameProps) => {
  const read = useFileText(file)
  const stageRef = useRef<HTMLDivElement>(null)
  const onScreen = useOnScreen(stageRef)
  const [canvas, setCanvas] = useState<{ width: number; height: number } | null>(null)
  if (read?.text === null) return unreadable(name)
  return (
    <ResizableBox
      size={size}
      fallback={canvas ? { width: canvas.width } : undefined}
      ratio={canvas ? canvas.width / canvas.height : undefined}
      axis="width"
      className={styles.sketchBox}
      onResize={onResize}
    >
      <div ref={stageRef} className={styles.frameStage}>
        {read && (
          <P5Reader
            key={read.revision}
            name={file.path}
            source={read.text}
            active={onScreen}
            embedded
            onSize={setCanvas}
          />
        )}
      </div>
    </ResizableBox>
  )
}

// An HTML page in place, in a sandbox as the HTML reader runs it, loaded again with each save.
export const EmbeddedPage = ({ file, name, size, onResize }: FrameProps) => {
  const read = useFileText(file)
  const [url, setUrl] = useState('')
  const text = read?.text
  useEffect(() => {
    if (typeof text !== 'string') return
    const next = URL.createObjectURL(new Blob([text], { type: 'text/html' }))
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [text])
  if (text === null) return unreadable(name)
  return (
    <ResizableBox size={size} axis="both" className={styles.pageBox} onResize={onResize}>
      {url && (
        <iframe
          className={styles.frameStage}
          src={url}
          title={file.path}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
        />
      )}
    </ResizableBox>
  )
}
