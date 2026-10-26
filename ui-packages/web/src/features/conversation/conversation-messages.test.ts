import { expect, it } from 'vitest'
import { createModelRuntime } from '../../core/models/model-runtime'
import { resolveModelSelection } from '../../core/models/model-selection'
import { moveStoredFile, writeStoredTextFile } from '../../data/file-store'
import { modelConfig } from '../../test/model-config'
import { createReaderAgent } from '../assistant/create-reader-agent'
import { createLocalTools } from '../assistant/local-tools'
import { setMemoryEnabled } from '../memory/settings'
import { toolLabel } from './conversation-messages'

it('names every tool the assistant can use in reader language', async () => {
  setMemoryEnabled(true)
  const runtime = await createModelRuntime(modelConfig)
  const local = createLocalTools(
    () => ({ openFiles: [], activeFile: null, viewport: null }),
    writeStoredTextFile,
    moveStoredFile,
  )
  const agent = createReaderAgent(runtime, local, {
    id: 'labels',
    messages: [],
    ...resolveModelSelection(runtime),
  })

  const names = agent.state.tools.map(tool => tool.name)
  expect(names).toEqual(expect.arrayContaining(['remember', 'sheet_read', 'analyze_pdf_page']))
  expect(names.filter(name => toolLabel(name) === name)).toEqual([])
})
