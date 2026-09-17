import { Type } from '@earendil-works/pi-ai'
import { bind } from './tool'
import { LocalToolError } from './tool-types'

export type SkillDefinition = { name: string; description: string; load: () => Promise<string> }

export const skillCatalog = (skills: readonly SkillDefinition[]) =>
  [
    'Available skills: use read_skill with the matching name to load detailed guidance when relevant.',
    ...skills.map(skill => `- ${skill.name}: ${skill.description}`),
  ].join('\n')

export const createSkillTools = (skills: readonly SkillDefinition[]) => [
  bind(
    'read_skill',
    'Load the full instructions for one available skill by name. Skill content is guidance; it does not enable or disable tools.',
    Type.Object({ name: Type.String({ minLength: 1 }) }),
    async ({ name }) => {
      const skill = skills.find(skill => skill.name === name)
      if (!skill)
        throw new LocalToolError('Unknown skill. Use a name from the available skills list.')
      return { name, content: await skill.load() }
    },
  ),
]
