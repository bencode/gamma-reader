import { LanguageRuntimeClient, RuntimeStoppedError } from './runtime/client'
import type {
  CodeLabCell,
  CodeLabCellSnapshot,
  CodeLabLanguage,
  CodeLabSession,
  CodeLabSessionSnapshot,
} from './types'

type CellRecord = {
  savedSource: string
  snapshot: CodeLabCellSnapshot
}

const idleSnapshot = (cell: CodeLabCell): CodeLabCellSnapshot => ({
  ...cell,
  dirty: false,
  phase: 'idle',
  progress: null,
  result: null,
  canRun: true,
  canStop: false,
})

export const createCodeLabSession = (initialCells: readonly CodeLabCell[]): CodeLabSession => {
  const order = initialCells.map(cell => cell.id)
  const duplicateId = order.find((id, index) => order.indexOf(id) !== index)
  if (duplicateId) throw new Error(`Duplicate Code Lab cell id: ${duplicateId}`)

  const cells = new Map(
    initialCells.map(cell => [
      cell.id,
      { savedSource: cell.source, snapshot: idleSnapshot(cell) } satisfies CellRecord,
    ]),
  )
  const cellListeners = new Map<string, Set<() => void>>()
  const sessionListeners = new Set<() => void>()
  const clients = new Map<CodeLabLanguage, LanguageRuntimeClient>()
  const runningCellByLanguage = new Map<CodeLabLanguage, string>()
  let sessionSnapshot: CodeLabSessionSnapshot = { dirty: false }

  const requireCell = (cellId: string): CellRecord => {
    const cell = cells.get(cellId)
    if (!cell) throw new Error(`Unknown Code Lab cell: ${cellId}`)
    return cell
  }

  const notifyCell = (cellId: string): void => {
    cellListeners.get(cellId)?.forEach(listener => {
      listener()
    })
  }

  const updateSessionSnapshot = (): void => {
    const dirty = Array.from(cells.values()).some(cell => cell.snapshot.dirty)
    if (dirty === sessionSnapshot.dirty) return
    sessionSnapshot = { dirty }
    sessionListeners.forEach(listener => {
      listener()
    })
  }

  const setCellSnapshot = (
    cellId: string,
    update: (snapshot: CodeLabCellSnapshot) => CodeLabCellSnapshot,
  ): void => {
    const cell = requireCell(cellId)
    cell.snapshot = update(cell.snapshot)
    notifyCell(cellId)
    updateSessionSnapshot()
  }

  const refreshLanguageAvailability = (language: CodeLabLanguage): void => {
    const runningCellId = runningCellByLanguage.get(language)
    cells.forEach(cell => {
      if (cell.snapshot.language !== language) return
      const canRun = runningCellId === undefined
      const canStop = cell.snapshot.id === runningCellId
      if (cell.snapshot.canRun === canRun && cell.snapshot.canStop === canStop) return
      cell.snapshot = { ...cell.snapshot, canRun, canStop }
      notifyCell(cell.snapshot.id)
    })
  }

  const getClient = (language: CodeLabLanguage): LanguageRuntimeClient => {
    const existing = clients.get(language)
    if (existing) return existing
    const client = new LanguageRuntimeClient(language)
    clients.set(language, client)
    return client
  }

  const stopCell = (cellId: string): void => {
    const cell = requireCell(cellId)
    if (runningCellByLanguage.get(cell.snapshot.language) !== cellId) return

    runningCellByLanguage.delete(cell.snapshot.language)
    getClient(cell.snapshot.language).stop()
    setCellSnapshot(cellId, snapshot => ({
      ...snapshot,
      phase: 'stopped',
      progress: null,
      canStop: false,
    }))
    refreshLanguageAvailability(cell.snapshot.language)
  }

  const session: CodeLabSession = {
    getCells: () =>
      order.map(cellId => {
        const { id, language, source } = requireCell(cellId).snapshot
        return { id, language, source }
      }),

    getCellSnapshot: cellId => requireCell(cellId).snapshot,
    getSessionSnapshot: () => sessionSnapshot,

    subscribeCell: (cellId, listener) => {
      requireCell(cellId)
      const listeners = cellListeners.get(cellId) ?? new Set()
      listeners.add(listener)
      cellListeners.set(cellId, listeners)
      return () => {
        listeners.delete(listener)
      }
    },

    subscribeSession: listener => {
      sessionListeners.add(listener)
      return () => {
        sessionListeners.delete(listener)
      }
    },

    updateCell: (cellId, source) => {
      const cell = requireCell(cellId)
      if (cell.snapshot.source === source) return
      setCellSnapshot(cellId, snapshot => ({
        ...snapshot,
        source,
        dirty: source !== cell.savedSource,
      }))
    },

    runCell: async cellId => {
      const cell = requireCell(cellId)
      const { language, source } = cell.snapshot
      if (runningCellByLanguage.has(language)) return

      runningCellByLanguage.set(language, cellId)
      setCellSnapshot(cellId, snapshot => ({
        ...snapshot,
        phase: 'loading',
        progress: `Starting ${language}…`,
        result: null,
      }))
      refreshLanguageAvailability(language)

      try {
        const result = await getClient(language).run(source, (progress, phase) => {
          if (runningCellByLanguage.get(language) !== cellId) return
          setCellSnapshot(cellId, snapshot => ({ ...snapshot, phase, progress }))
        })
        if (runningCellByLanguage.get(language) !== cellId) return
        setCellSnapshot(cellId, snapshot => ({
          ...snapshot,
          phase: result.error ? 'failed' : 'succeeded',
          progress: null,
          result,
        }))
      } catch (error) {
        if (error instanceof RuntimeStoppedError) return
        console.error(`Unable to run ${language} cell`, error)
        if (runningCellByLanguage.get(language) !== cellId) return
        setCellSnapshot(cellId, snapshot => ({
          ...snapshot,
          phase: 'failed',
          progress: null,
          result: {
            outputs: [],
            error: error instanceof Error ? error.message : String(error),
          },
        }))
      } finally {
        if (runningCellByLanguage.get(language) === cellId) {
          runningCellByLanguage.delete(language)
          refreshLanguageAvailability(language)
        }
      }
    },

    stopCell,

    resetCell: cellId => {
      const cell = requireCell(cellId)
      stopCell(cellId)
      setCellSnapshot(cellId, snapshot => ({
        ...snapshot,
        source: cell.savedSource,
        dirty: false,
        phase: 'idle',
        progress: null,
        result: null,
      }))
    },

    markSaved: () => {
      cells.forEach((cell, cellId) => {
        cell.savedSource = cell.snapshot.source
        if (!cell.snapshot.dirty) return
        cell.snapshot = { ...cell.snapshot, dirty: false }
        notifyCell(cellId)
      })
      updateSessionSnapshot()
    },

    dispose: () => {
      const runningCells = Array.from(runningCellByLanguage.values())
      clients.forEach(client => {
        client.dispose()
      })
      clients.clear()
      runningCellByLanguage.clear()
      runningCells.forEach(cellId => {
        const cell = requireCell(cellId)
        cell.snapshot = {
          ...cell.snapshot,
          phase: 'stopped',
          progress: null,
          canRun: true,
          canStop: false,
        }
      })
      cellListeners.clear()
      sessionListeners.clear()
    },
  }

  return session
}
