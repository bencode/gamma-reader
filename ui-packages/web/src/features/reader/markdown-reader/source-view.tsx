import { markdown } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'
import { basicSetup, EditorView } from 'codemirror'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import styles from './style.module.scss'

export type MarkdownSourceViewHandle = {
  getViewportElements: () => { content: HTMLElement; scroll: HTMLElement } | null
}

export const MarkdownSourceView = forwardRef<
  MarkdownSourceViewHandle,
  {
    content: string
    name: string
    scrollPosition: { current: number }
  }
>(function MarkdownSourceView({ content, name, scrollPosition }, ref) {
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
        markdown({ addKeymap: false, completeHTMLTags: false }),
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
  }, [content, name, scrollPosition])

  return <div className={styles.sourceView} ref={hostRef} />
})
