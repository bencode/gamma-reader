import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { CodeLabLanguage } from '../../types'
import { loadLanguageExtension } from './language-extension'

type CodeEditorProps = {
  language: CodeLabLanguage
  source: string
  readOnly: boolean
  onChange(source: string): void
  onRun(): void
}

const synchronize = (view: EditorView, source: string, applyingExternal: { current: boolean }) => {
  const previous = view.state.doc.toString()
  if (previous === source) return
  let from = 0
  while (from < previous.length && from < source.length && previous[from] === source[from]) from++
  let to = previous.length
  let end = source.length
  while (to > from && end > from && previous[to - 1] === source[end - 1]) {
    to--
    end--
  }
  applyingExternal.current = true
  try {
    view.dispatch({ changes: { from, to, insert: source.slice(from, end) } })
  } finally {
    applyingExternal.current = false
  }
}

export const CodeEditor = ({ language, source, readOnly, onChange, onRun }: CodeEditorProps) => {
  const rootRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<EditorView | null>(null)
  const languageCompartment = useRef(new Compartment())
  const editableCompartment = useRef(new Compartment())
  const sourceRef = useRef(source)
  const readOnlyRef = useRef(readOnly)
  const changeRef = useRef(onChange)
  const runRef = useRef(onRun)
  const retained = useRef<EditorState | null>(null)
  const scroll = useRef<ReturnType<EditorView['scrollSnapshot']> | null>(null)
  const restoringScroll = useRef(true)
  const applyingExternal = useRef(false)

  useLayoutEffect(() => {
    sourceRef.current = source
    readOnlyRef.current = readOnly
    changeRef.current = onChange
    runRef.current = onRun
  }, [source, readOnly, onChange, onRun])

  const restoreScroll = useCallback(() => {
    const view = editorRef.current
    if (!restoringScroll.current || !view?.scrollDOM.clientWidth || !view.scrollDOM.clientHeight)
      return
    restoringScroll.current = false
    if (scroll.current) view.dispatch({ effects: scroll.current })
    view.requestMeasure()
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    restoringScroll.current = true
    const editor = new EditorView({
      parent: root,
      scrollTo: scroll.current ?? undefined,
      state:
        retained.current ??
        EditorState.create({
          doc: sourceRef.current,
          extensions: [
            basicSetup,
            EditorView.contentAttributes.of({ 'aria-label': 'Code' }),
            languageCompartment.current.of([]),
            editableCompartment.current.of([
              EditorState.readOnly.of(readOnlyRef.current),
              EditorView.editable.of(!readOnlyRef.current),
            ]),
            keymap.of([
              {
                key: 'Mod-Enter',
                run: () => {
                  runRef.current()
                  return true
                },
              },
            ]),
            EditorView.updateListener.of(update => {
              if (!update.docChanged) return
              scroll.current = scroll.current?.map(update.changes) ?? null
              if (!applyingExternal.current) changeRef.current(update.state.doc.toString())
            }),
          ],
        }),
    })
    editorRef.current = editor
    synchronize(editor, sourceRef.current, applyingExternal)
    const recordScroll = () => {
      if (!restoringScroll.current && editor.scrollDOM.clientWidth && editor.scrollDOM.clientHeight)
        scroll.current = editor.scrollSnapshot()
    }
    const observer = new ResizeObserver(restoreScroll)
    observer.observe(editor.scrollDOM)
    editor.scrollDOM.addEventListener('scroll', recordScroll)
    return () => {
      observer.disconnect()
      editor.scrollDOM.removeEventListener('scroll', recordScroll)
      retained.current = editor.state
      editor.destroy()
      editorRef.current = null
    }
  }, [restoreScroll])

  useEffect(() => {
    const editor = editorRef.current
    if (editor) synchronize(editor, source, applyingExternal)
  }, [source])

  useEffect(() => {
    editorRef.current?.dispatch({
      effects: editableCompartment.current.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    })
  }, [readOnly])

  useEffect(() => {
    let current = true
    void loadLanguageExtension(language)
      .then(extension => {
        if (current)
          editorRef.current?.dispatch({
            effects: languageCompartment.current.reconfigure(extension),
          })
      })
      .catch(error => console.error(`Unable to load ${language} syntax highlighting`, error))
    return () => {
      current = false
    }
  }, [language])

  return <div ref={rootRef} />
}
