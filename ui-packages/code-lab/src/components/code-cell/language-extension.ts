import type { Extension } from '@codemirror/state'
import type { CodeLabLanguage } from '../../types'

const loaders: Readonly<Record<CodeLabLanguage, () => Promise<Extension>>> = {
  python: () => import('@codemirror/lang-python').then(module => module.python()),
  typescript: () =>
    import('@codemirror/lang-javascript').then(module => module.javascript({ typescript: true })),
  scheme: async () => {
    const [{ StreamLanguage }, { scheme }] = await Promise.all([
      import('@codemirror/language'),
      import('@codemirror/legacy-modes/mode/scheme'),
    ])
    return StreamLanguage.define(scheme)
  },
  clojure: async () => {
    const [{ StreamLanguage }, { clojure }] = await Promise.all([
      import('@codemirror/language'),
      import('@codemirror/legacy-modes/mode/clojure'),
    ])
    return StreamLanguage.define(clojure)
  },
}

export const loadLanguageExtension = (language: CodeLabLanguage): Promise<Extension> =>
  loaders[language]()
