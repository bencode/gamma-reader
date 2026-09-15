import { EditorState, type Extension } from '@codemirror/state'
import { basicSetup, EditorView } from 'codemirror'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import styles from './style.module.scss'

export type SourceLanguage = 'plain' | 'markdown' | 'javascript' | 'typescript'

export type SourceEditorProps = {
  name: string
  value: string
  language: SourceLanguage
  active: boolean
  onChange: (value: string) => void
}

const languageExtensions = async (language: SourceLanguage): Promise<readonly Extension[]> => {
  if (language === 'markdown') {
    const { markdown } = await import('@codemirror/lang-markdown')
    return [markdown({ addKeymap: false, completeHTMLTags: false })]
  }
  if (language === 'javascript' || language === 'typescript') {
    const { javascript } = await import('@codemirror/lang-javascript')
    return [javascript({ typescript: language === 'typescript' })]
  }
  return []
}

const synchronize = (view: EditorView, next: string, applyingExternal: { current: boolean }) => {
  const previous = view.state.doc.toString()
  if (previous === next) return
  let from = 0
  while (from < previous.length && from < next.length && previous[from] === next[from]) from++
  let to = previous.length
  let end = next.length
  while (to > from && end > from && previous[to - 1] === next[end - 1]) {
    to--
    end--
  }
  applyingExternal.current = true
  try {
    view.dispatch({ changes: { from, to, insert: next.slice(from, end) } })
  } finally {
    applyingExternal.current = false
  }
}

export const SourceEditor = ({ name, value, language, active, onChange }: SourceEditorProps) => {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView>(null)
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const activeRef = useRef(active)
  const retained = useRef<EditorState | null>(null)
  const scroll = useRef<ReturnType<EditorView['scrollSnapshot']> | null>(null)
  const restoringScroll = useRef(true)
  const applyingExternal = useRef(false)
  const [error, setError] = useState<string | null>(null)
  useLayoutEffect(() => {
    valueRef.current = value
    onChangeRef.current = onChange
  }, [value, onChange])
  useLayoutEffect(() => {
    activeRef.current = active
    if (active) restoringScroll.current = true
  }, [active])

  const restoreScroll = useCallback(() => {
    const view = viewRef.current
    if (
      !restoringScroll.current ||
      !activeRef.current ||
      !view?.scrollDOM.clientWidth ||
      !view.scrollDOM.clientHeight
    )
      return
    restoringScroll.current = false
    if (scroll.current) view.dispatch({ effects: scroll.current })
    view.requestMeasure()
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let disposed = false
    const observer = new ResizeObserver(restoreScroll)
    const recordScroll = () => {
      const view = viewRef.current
      if (
        !restoringScroll.current &&
        activeRef.current &&
        view?.scrollDOM.clientWidth &&
        view.scrollDOM.clientHeight
      )
        scroll.current = view.scrollSnapshot()
    }
    void languageExtensions(language).then(
      extensions => {
        if (disposed) return
        const view = new EditorView({
          parent: host,
          scrollTo: scroll.current ?? undefined,
          state:
            retained.current ??
            EditorState.create({
              doc: valueRef.current,
              extensions: [
                basicSetup,
                ...extensions,
                EditorView.lineWrapping,
                EditorView.contentAttributes.of({ 'aria-label': `${name} source` }),
                EditorView.updateListener.of(update => {
                  if (!update.docChanged) return
                  scroll.current = scroll.current?.map(update.changes) ?? null
                  if (applyingExternal.current) return
                  const content = update.state.doc.toString()
                  if (content !== valueRef.current) onChangeRef.current(content)
                }),
              ],
            }),
        })
        viewRef.current = view
        synchronize(view, valueRef.current, applyingExternal)
        view.scrollDOM.addEventListener('scroll', recordScroll)
        observer.observe(view.scrollDOM)
        view.requestMeasure()
      },
      cause => {
        console.error('Unable to load source editor language support', cause)
        if (!disposed) setError('The source editor could not be loaded. Reload to try again.')
      },
    )
    return () => {
      disposed = true
      observer.disconnect()
      const view = viewRef.current
      if (view) {
        retained.current = view.state
        view.scrollDOM.removeEventListener('scroll', recordScroll)
        view.destroy()
      }
      viewRef.current = null
    }
  }, [language, name, restoreScroll])

  useEffect(() => {
    const view = viewRef.current
    if (view) synchronize(view, value, applyingExternal)
  }, [value])

  useEffect(() => {
    if (!active) return
    restoreScroll()
  }, [active, restoreScroll])

  return (
    <div className={styles.root} ref={hostRef}>
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
