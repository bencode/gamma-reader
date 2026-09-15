import type { CodeLabExecutionResult, CodeLabLanguage } from '../types'
import type { RuntimeRequest, RuntimeResponse } from './protocol'

type PendingRun = {
  requestId: string
  resolve: (result: CodeLabExecutionResult) => void
  reject: (error: Error) => void
  onProgress: (message: string, phase: 'loading' | 'running') => void
}

export class RuntimeStoppedError extends Error {
  constructor() {
    super('Runtime stopped')
    this.name = 'RuntimeStoppedError'
  }
}

export class LanguageRuntimeClient {
  readonly language: CodeLabLanguage

  private worker: Worker | null = null
  private pending: PendingRun | null = null

  constructor(language: CodeLabLanguage) {
    this.language = language
  }

  run(
    source: string,
    onProgress: (message: string, phase: 'loading' | 'running') => void,
  ): Promise<CodeLabExecutionResult> {
    if (this.pending) return Promise.reject(new Error(`${this.language} runtime is busy`))

    const worker = this.getWorker()
    const requestId = crypto.randomUUID()
    const request: RuntimeRequest = { type: 'run', requestId, language: this.language, source }

    return new Promise((resolve, reject) => {
      this.pending = { requestId, resolve, reject, onProgress }
      worker.postMessage(request)
    })
  }

  stop(): void {
    this.worker?.terminate()
    this.worker = null
    this.rejectPending(new RuntimeStoppedError())
  }

  dispose(): void {
    this.stop()
  }

  private getWorker(): Worker {
    if (this.worker) return this.worker

    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = event => {
      if (this.worker === worker) this.receive(event.data as RuntimeResponse)
    }
    worker.onerror = event => {
      if (this.worker !== worker) return
      console.error(`The ${this.language} runtime worker failed`, event.error ?? event.message)
      worker.terminate()
      this.worker = null
      this.rejectPending(new Error(event.message || `${this.language} runtime worker failed`))
    }
    this.worker = worker
    return worker
  }

  private receive(response: RuntimeResponse): void {
    const pending = this.pending
    if (!pending || pending.requestId !== response.requestId) return

    if (response.type === 'progress') {
      pending.onProgress(response.message, response.phase)
      return
    }

    this.pending = null
    if (response.type === 'result') {
      pending.resolve(response.result)
      return
    }
    pending.reject(new Error(response.error))
  }

  private rejectPending(error: Error): void {
    const pending = this.pending
    if (!pending) return
    this.pending = null
    pending.reject(error)
  }
}
