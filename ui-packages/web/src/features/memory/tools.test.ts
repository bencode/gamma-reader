import type { AgentTool } from '@earendil-works/pi-agent-core'
import { afterEach, describe, expect, it } from 'vitest'
import { LocalToolError } from '../agent/tool-types'
import { setMemoryEnabled } from './settings'
import { createMemoryTools } from './tools'

const run = async (tools: AgentTool[], name: string, input: unknown) => {
  const tool = tools.find(candidate => candidate.name === name)
  const result = await tool?.execute('call', input as never)
  const [content] = result?.content ?? []
  return JSON.parse(content?.type === 'text' ? content.text : 'null')
}

const inProject = (projectKey: string) => createMemoryTools({ projectKey, conversationId: 'c' })

describe('memory tools', () => {
  afterEach(() => setMemoryEnabled(false))

  it('recalls what is about the reader everywhere and what is about a project only there', async () => {
    setMemoryEnabled(true)
    const sicp = inProject('gamma-reader-project-sicp')
    await run(sicp, 'remember', { text: '读者喜欢简短的中文回答', scope: 'reader' })
    await run(sicp, 'remember', { text: '读者正在读 SICP 1.2 的迭代过程', scope: 'project' })

    const recall = (tools: AgentTool[]) =>
      run(tools, 'recall_memory', { queries: ['读者'] }).then(result =>
        result.entries.map((entry: { text: string }) => entry.text),
      )
    expect(await recall(sicp)).toEqual(
      expect.arrayContaining(['读者喜欢简短的中文回答', '读者正在读 SICP 1.2 的迭代过程']),
    )
    expect(await recall(inProject('gamma-reader-project-other'))).toEqual([
      '读者喜欢简短的中文回答',
    ])
  })

  it('refuses while memory is off', async () => {
    setMemoryEnabled(false)
    await expect(
      run(inProject('p'), 'remember', { text: 'Anything', scope: 'reader' }),
    ).rejects.toBeInstanceOf(LocalToolError)
  })
})
