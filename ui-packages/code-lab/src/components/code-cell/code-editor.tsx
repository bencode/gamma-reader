import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { useEffect, useRef } from 'react'
import type { CodeLabLanguage } from '../../types'
import { loadLanguageExtension } from './language-extension'

type CodeEditorProps = {
  language: CodeLabLanguage
  source: string
  readOnly: boolean
  onChange(source: string): void
  onRun(): void
}

export const CodeEditor = ({ language, source, readOnly, onChange, onRun }: CodeEditorProps) => {
  const rootRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<EditorView | null>(null)
  const languageCompartment = useRef(new Compartment())
  const editableCompartment = useRef(new Compartment())
  const initialSource = useRef(source)
  const initialReadOnly = useRef(readOnly)
  const changeRef = useRef(onChange)
  const runRef = useRef(onRun)
  changeRef.current = onChange
  runRef.current = onRun

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const editor = new EditorView({
      parent: root,
      state: EditorState.create({
        doc: initialSource.current,
        extensions: [
          basicSetup,
          EditorView.lineWrapping,
          languageCompartment.current.of([]),
          editableCompartment.current.of(EditorView.editable.of(!initialReadOnly.current)),
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
            if (update.docChanged) changeRef.current(update.state.doc.toString())
          }),
        ],
      }),
    })
    editorRef.current = editor
    return () => {
      editor.destroy()
      editorRef.current = null
    }
  }, [])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || editor.state.doc.toString() === source) return
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: source } })
  }, [source])

  useEffect(() => {
    editorRef.current?.dispatch({
      effects: editableCompartment.current.reconfigure(EditorView.editable.of(!readOnly)),
    })
  }, [readOnly])

  useEffect(() => {
    let current = true
    void loadLanguageExtension(language)
      .then(extension => {
        if (!current || !editorRef.current) return
        editorRef.current.dispatch({
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
