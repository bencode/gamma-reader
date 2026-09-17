import type { AgentTool } from '@earendil-works/pi-agent-core'
import type { Static, TSchema } from '@earendil-works/pi-ai'
export const bind = <P extends TSchema>(
  name: string,
  description: string,
  parameters: P,
  execute: (input: Static<P>, signal?: AbortSignal) => unknown | Promise<unknown>,
): AgentTool<P, undefined> => ({
  name,
  label: name,
  description,
  parameters,
  executionMode: 'sequential',
  execute: async (_id, input, signal) => {
    signal?.throwIfAborted()
    const result = await execute(input, signal)
    signal?.throwIfAborted()
    return { content: [{ type: 'text', text: JSON.stringify(result) }], details: undefined }
  },
})
