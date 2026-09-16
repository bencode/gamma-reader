import { LanguageRuntimeClient, RuntimeStoppedError } from './runtime/client'
import type {
  CodeLabCell,
  CodeLabCellPhase,
  CodeLabExecutionResult,
  CodeLabLanguage,
} from './types'

export type CellExecution = Readonly<{
  language: CodeLabLanguage
  source: string
  phase: Exclude<CodeLabCellPhase, 'idle'>
  progress: string | null
  result: CodeLabExecutionResult | null
}>

type RunningTask = { cellId: string }
type Snapshot = ReadonlyMap<string, CellExecution>

export const createCodeLabRuntime = () => {
  let snapshot: Snapshot = new Map()
  const listeners = new Set<() => void>()
  const clients = new Map<CodeLabLanguage, LanguageRuntimeClient>()
  const running = new Map<CodeLabLanguage, RunningTask>()

  const publish = (next: Snapshot) => {
    snapshot = next
    listeners.forEach(listener => {
      listener()
    })
  }
  const update = (id: string, change: (execution: CellExecution) => CellExecution) => {
    const execution = snapshot.get(id)
    if (execution) publish(new Map(snapshot).set(id, change(execution)))
  }
  const stopLanguage = (language: CodeLabLanguage) => {
    running.delete(language)
    clients.get(language)?.stop()
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    synchronizeMembership: (cells: readonly CodeLabCell[]) => {
      const languages = new Map(cells.map(cell => [cell.id, cell.language]))
      const removed = [...snapshot].filter(
        ([id, execution]) => languages.get(id) !== execution.language,
      )
      if (!removed.length) return
      const next = new Map(snapshot)
      removed.forEach(([id, execution]) => {
        if (running.get(execution.language)?.cellId === id) stopLanguage(execution.language)
        next.delete(id)
      })
      publish(next)
    },

    runCell: async ({ id, language, source }: CodeLabCell): Promise<void> => {
      if (running.has(language)) return
      const task: RunningTask = { cellId: id }
      running.set(language, task)
      publish(
        new Map(snapshot).set(id, {
          language,
          source,
          phase: 'loading',
          progress: `Starting ${language}…`,
          result: null,
        }),
      )

      try {
        let client = clients.get(language)
        if (!client) {
          client = new LanguageRuntimeClient(language)
          clients.set(language, client)
        }
        const result = await client.run(source, (progress, phase) => {
          if (running.get(language) !== task) return
          update(id, execution => ({ ...execution, phase, progress }))
        })
        if (running.get(language) !== task) return
        running.delete(language)
        update(id, execution => ({
          ...execution,
          phase: result.error ? 'failed' : 'succeeded',
          progress: null,
          result,
        }))
      } catch (error) {
        if (error instanceof RuntimeStoppedError) return
        console.error(`Unable to run ${language} cell`, error)
        if (running.get(language) !== task) return
        running.delete(language)
        update(id, execution => ({
          ...execution,
          phase: 'failed',
          progress: null,
          result: { outputs: [], error: error instanceof Error ? error.message : String(error) },
        }))
      }
    },

    stopCell: (id: string) => {
      const execution = snapshot.get(id)
      if (!execution || running.get(execution.language)?.cellId !== id) return
      stopLanguage(execution.language)
      update(id, current => ({ ...current, phase: 'stopped', progress: null }))
    },

    dispose: () => {
      const stopped = new Map(snapshot)
      running.forEach(({ cellId }) => {
        const execution = stopped.get(cellId)
        if (execution) stopped.set(cellId, { ...execution, phase: 'stopped', progress: null })
      })
      running.clear()
      clients.forEach(client => {
        client.dispose()
      })
      clients.clear()
      if ([...stopped].some(([id, execution]) => snapshot.get(id) !== execution)) publish(stopped)
    },
  }
}

export type CodeLabRuntime = ReturnType<typeof createCodeLabRuntime>
