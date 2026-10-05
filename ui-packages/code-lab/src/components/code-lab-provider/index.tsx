import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { type CodeLabRuntime, createCodeLabRuntime } from '../../code-lab-runtime'
import type { CodeLabProviderProps } from '../../types'

type CodeLabContextValue = Pick<
  CodeLabProviderProps,
  'cells' | 'onCellChange' | 'onCellAdvance'
> & {
  runtime: CodeLabRuntime
}

const CodeLabContext = createContext<CodeLabContextValue | null>(null)

export const CodeLabProvider = ({
  cells,
  onCellChange,
  onCellAdvance,
  children,
}: CodeLabProviderProps) => {
  const [runtime] = useState(createCodeLabRuntime)
  const value = useMemo(() => {
    const ids = new Set<string>()
    cells.forEach(cell => {
      if (ids.has(cell.id)) throw new Error(`Duplicate Code Lab cell id: ${cell.id}`)
      ids.add(cell.id)
    })
    return { cells, onCellChange, onCellAdvance, runtime }
  }, [cells, onCellChange, onCellAdvance, runtime])

  useLayoutEffect(() => {
    runtime.synchronizeMembership(cells)
  }, [cells, runtime])

  useEffect(() => () => runtime.dispose(), [runtime])

  return <CodeLabContext.Provider value={value}>{children}</CodeLabContext.Provider>
}

export const useCodeLabContext = () => {
  const context = useContext(CodeLabContext)
  if (!context) throw new Error('CodeCell must be rendered inside a CodeLabProvider.')
  return context
}

// The runtime behind the cells, for code outside them that runs cells or reads their results.
export const useCodeLabRuntime = () => useCodeLabContext().runtime
