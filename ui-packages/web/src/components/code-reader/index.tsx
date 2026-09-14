import { EditorState, type Extension } from '@codemirror/state'
import { basicSetup, EditorView } from 'codemirror'
import { forwardRef, type RefObject, useEffect, useImperativeHandle, useRef } from 'react'
import styles from './style.module.scss'

export type CodeReaderHandle = {
  getViewportElements: () => { content: HTMLElement; scroll: HTMLElement } | null
}

export type CodeReaderProps = {
  content: string
  name: string
  extensions: readonly Extension[]
  scrollPosition: RefObject<number>
}

export const CodeReader = forwardRef<CodeReaderHandle, CodeReaderProps>(function CodeReader(
  { content, name, extensions, scrollPosition },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView>(null)

  useImperativeHandle(
    ref,
    () => ({
      getViewportElements: () => {
        const view = viewRef.current
        return view ? { content: view.contentDOM, scroll: view.scrollDOM } : null
      },
    }),
    [],
  )

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const view = new EditorView({
      doc: content,
      parent: host,
      extensions: [
        basicSetup,
        ...extensions,
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': `${name} source` }),
      ],
    })
    viewRef.current = view
    const scroll = view.scrollDOM
    const recordScroll = () => {
      scrollPosition.current = scroll.scrollTop
    }
    scroll.addEventListener('scroll', recordScroll, { passive: true })
    const frame = requestAnimationFrame(() => {
      scroll.scrollTop = scrollPosition.current
      view.requestMeasure()
    })
    return () => {
      cancelAnimationFrame(frame)
      scroll.removeEventListener('scroll', recordScroll)
      scrollPosition.current = scroll.scrollTop
      view.destroy()
      viewRef.current = null
    }
  }, [content, extensions, name, scrollPosition])

  return <div className={styles.root} ref={hostRef} />
})
