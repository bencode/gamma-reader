/// <reference lib="webworker" />

import type { CodeLabLanguage } from '../types'
import type { LanguageRuntime, RuntimeRequest, RuntimeResponse } from './protocol'

const runtimeLoaders: Readonly<Record<CodeLabLanguage, () => Promise<LanguageRuntime>>> = {
  python: () => import('./languages/python').then(module => module.pythonRuntime),
  scheme: () => import('./languages/scheme').then(module => module.schemeRuntime),
  clojure: () => import('./languages/clojure').then(module => module.clojureRuntime),
  typescript: () => import('./languages/typescript').then(module => module.typescriptRuntime),
}

let runtime: LanguageRuntime | null = null
let activeLanguage: CodeLabLanguage | null = null

const respond = (response: RuntimeResponse): void => self.postMessage(response)

const getRuntime = async (language: CodeLabLanguage): Promise<LanguageRuntime> => {
  if (activeLanguage && activeLanguage !== language) {
    throw new Error(`Runtime already initialized for ${activeLanguage}`)
  }
  activeLanguage = language
  runtime ??= await runtimeLoaders[language]()
  return runtime
}

const run = async (request: RuntimeRequest): Promise<void> => {
  try {
    const languageRuntime = await getRuntime(request.language)
    const result = await languageRuntime.run(request.source, (message, phase = 'loading') => {
      respond({ type: 'progress', requestId: request.requestId, message, phase })
    })
    respond({ type: 'result', requestId: request.requestId, result })
  } catch (error) {
    console.error(`The ${request.language} runtime failed`, error)
    respond({
      type: 'failure',
      requestId: request.requestId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

self.addEventListener('message', event => {
  void run(event.data as RuntimeRequest)
})
