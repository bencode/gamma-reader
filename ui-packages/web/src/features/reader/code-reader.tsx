import { LanguageDescription } from '@codemirror/language'
import { EditorState, type Extension } from '@codemirror/state'
import { basicSetup, EditorView } from 'codemirror'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import styles from '../../components/source-editor/style.module.scss'
import { baseName } from '../../core/files'
import type { ReaderState } from '../../core/reader-state'
import type { ReadingPosition } from '../../core/reading-position'
import { useReaderBinding } from '../../shell/workspace-context'
import type { TextReaderProps } from './text-file-reader'

// Each language arrives the first time a file in it is opened; an unknown one reads as plain text.
const languageFor = async (path: string): Promise<readonly Extension[]> => {
  const { languages } = await import('@codemirror/language-data')
  const description = LanguageDescription.matchFilename(languages, baseName(path))
  return description ? [await description.load()] : []
}

// The line at the top of the view and the share of it scrolled past: a flow position by line.
const positionOf = (view: EditorView): ReadingPosition => {
  const top = view.scrollDOM.scrollTop - view.documentPadding.top
  const block = view.lineBlockAtHeight(Math.max(top, 0))
  const offset = block.height > 0 ? (top - block.top) / block.height : 0
  return {
    kind: 'flow',
    block: view.state.doc.lineAt(block.from).number - 1,
    offset: Math.min(Math.max(offset, 0), 0.999),
  }
}

const restore = (view: EditorView, position: ReadingPosition) => {
  if (position.kind !== 'flow') return
  const line = view.state.doc.line(Math.min(position.block + 1, view.state.doc.lines))
  view.dispatch({ effects: EditorView.scrollIntoView(line.from, { y: 'start' }) })
}

// The first and last lines on screen, so the assistant can find what the reader is looking at.
const visibleText = (view: EditorView | null): ReaderState['viewport'] => {
  if (!view?.scrollDOM.clientHeight) return null
  const top = Math.max(view.scrollDOM.scrollTop - view.documentPadding.top, 0)
  const first = view.lineBlockAtHeight(top)
  const last = view.lineBlockAtHeight(top + view.scrollDOM.clientHeight - 1)
  return {
    startText: view.state.doc.lineAt(first.from).text.trim().slice(0, 100),
    endText: view.state.doc.lineAt(last.from).text.trim().slice(-100),
  }
}

// Source code reads in place: highlighted by its language, numbered, foldable and searchable,
// and selectable to copy. It is a reader, not an editor, and has no Source view beside it.
export const CodeReader = ({
  document,
  content,
  active,
  defaultPosition,
  onPositionChange,
}: TextReaderProps) => {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const activeRef = useRef(active)
  const onPositionRef = useRef(onPositionChange)
  // The starting place is taken once, when the reader is first shown with its code laid out.
  const pendingPosition = useRef(defaultPosition)
  const [error, setError] = useState<string | null>(null)
  useLayoutEffect(() => {
    activeRef.current = active
    onPositionRef.current = onPositionChange
  }, [active, onPositionChange])

  const showStart = useCallback(() => {
    const view = viewRef.current
    const position = pendingPosition.current
    if (!view || !position || !activeRef.current || !view.scrollDOM.clientHeight) return
    pendingPosition.current = undefined
    restore(view, position)
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let disposed = false
    const report = () => {
      const view = viewRef.current
      if (view && activeRef.current && !pendingPosition.current)
        onPositionRef.current(positionOf(view))
    }
    void languageFor(document.path).then(
      extensions => {
        if (disposed) return
        const view = new EditorView({
          parent: host,
          state: EditorState.create({
            doc: content,
            extensions: [
              basicSetup,
              ...extensions,
              EditorState.readOnly.of(true),
              EditorView.contentAttributes.of({ 'aria-label': `${document.path} code` }),
            ],
          }),
        })
        viewRef.current = view
        view.scrollDOM.addEventListener('scroll', report)
        showStart()
      },
      cause => {
        console.error('Unable to load the code reader', cause)
        if (!disposed) setError('This code could not be shown. Reload to try again.')
      },
    )
    return () => {
      disposed = true
      const view = viewRef.current
      if (view) {
        // Saved edits bring new text; the reader picks up where it was rather than at the top.
        if (!pendingPosition.current) pendingPosition.current = positionOf(view)
        view.scrollDOM.removeEventListener('scroll', report)
        view.destroy()
      }
      viewRef.current = null
    }
  }, [content, document.path, showStart])

  // A tab opened in the background lays its code out only once it is shown.
  useEffect(() => {
    if (active) showStart()
  }, [active, showStart])

  const binding = useMemo(
    () => ({ fileId: document.id, getViewport: () => visibleText(viewRef.current) }),
    [document.id],
  )
  useReaderBinding(binding, active)

  return (
    <div className={styles.root} ref={hostRef}>
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
