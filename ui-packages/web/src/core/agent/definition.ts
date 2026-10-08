import type { AgentTool, StreamFn } from '@earendil-works/pi-agent-core'
import { apiKeyFor, models, proxyRequestOptions } from '../models/model-runtime'
import { createSkillTools, type SkillDefinition, skillCatalog } from './skills'

// Guidance an agent loads when it needs it, and the tools that come with it. An agent sees only
// the skills it is given, so adding a skill to one agent costs the others nothing.
export type Skill<C> = SkillDefinition & { tools?: (context: C) => AgentTool[] }

// A role: what it is told, the tools it always has, and the skills it may load.
export type AgentDefinition<C> = {
  name: string
  instructions: string
  tools: (context: C) => AgentTool[]
  skills: readonly Skill<C>[]
}

export const assemble = <C>(definition: AgentDefinition<C>, context: C) => {
  const { instructions, skills } = definition
  return {
    systemPrompt: skills.length ? `${instructions}\n\n${skillCatalog(skills)}` : instructions,
    tools: [
      ...definition.tools(context),
      ...skills.flatMap(skill => skill.tools?.(context) ?? []),
      ...(skills.length ? createSkillTools(skills) : []),
    ],
  }
}

// A run stopped during a tool still asks for one more reply; pi-ai would report that request as
// an error, so end it here and let the agent record the run as stopped.
export const streamFn: StreamFn = (model, context, options) => {
  options?.signal?.throwIfAborted()
  return models.streamSimple(model, context, {
    ...options,
    ...proxyRequestOptions,
    apiKey: apiKeyFor(model),
  })
}
