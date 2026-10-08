import type { AgentTool } from '@earendil-works/pi-agent-core'
import type { Static, TSchema, Usage } from '@earendil-works/pi-ai'

export class LocalToolError extends Error {}

// A tool that calls a model itself returns that call's usage beside its result. Pi keeps it on the
// tool result, apart from the context the model sees.
export class Metered {
  constructor(
    readonly result: unknown,
    readonly usage: Usage,
  ) {}
}

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
    const output = await execute(input, signal)
    signal?.throwIfAborted()
    const result = output instanceof Metered ? output.result : output
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      details: undefined,
      ...(output instanceof Metered && { usage: output.usage }),
    }
  },
})
