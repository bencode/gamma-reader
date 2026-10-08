import { Type } from '@earendil-works/pi-ai'
import { describe, expect, it } from 'vitest'
import { type AgentDefinition, assemble } from './definition'
import { bind } from './tool'

const tool = (name: string) => bind(name, name, Type.Object({}), () => null)
const names = (definition: AgentDefinition<null>) =>
  assemble(definition, null).tools.map(item => item.name)

const charts = {
  name: 'charts',
  description: 'Draw charts.',
  load: async () => 'How to draw charts.',
  tools: () => [tool('draw_chart')],
}

describe('agent definitions', () => {
  it('gives a skill and its tools only to the agents that have it', () => {
    const withCharts = {
      name: 'a',
      instructions: 'A',
      tools: () => [tool('read')],
      skills: [charts],
    }
    const without = { name: 'b', instructions: 'B', tools: () => [tool('read')], skills: [] }

    expect(names(withCharts)).toEqual(['read', 'draw_chart', 'read_skill'])
    expect(assemble(withCharts, null).systemPrompt).toContain('- charts: Draw charts.')
    expect(names(without)).toEqual(['read'])
    expect(assemble(without, null).systemPrompt).toBe('B')
  })
})
