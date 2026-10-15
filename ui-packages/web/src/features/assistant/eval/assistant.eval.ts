import { Blob, File } from 'node:buffer'
import { appendFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { loadModelConfig } from '../../../core/models/model-config'
import { createModelRuntime } from '../../../core/models/model-runtime'
import { resolveModelSelection } from '../../../core/models/model-selection'
import { deleteFileStore } from '../../../data/file-store'
import { createReaderAgent } from '../create-reader-agent'
import { type Call, scenarios } from './scenarios'
import { workspace } from './workspace'

vi.stubGlobal('Blob', Blob)
vi.stubGlobal('File', File)

const runs = Number(process.env.GAMMA_EVAL_RUNS ?? 3)
if (!Number.isInteger(runs) || runs < 1)
  throw new Error('GAMMA_EVAL_RUNS must be a positive integer.')
const config = await loadModelConfig(new AbortController().signal)
if (!config.enabled) throw new Error('The eval backend has no enabled model.')
const runtime = await createModelRuntime(config)
const requested = process.env.GAMMA_EVAL_MODEL
  ? {
      provider: process.env.GAMMA_EVAL_PROVIDER ?? runtime.defaultModel.provider,
      modelId: process.env.GAMMA_EVAL_MODEL,
      effort: 'off' as const,
    }
  : undefined
const selection = resolveModelSelection(runtime, requested)
if (
  requested &&
  (selection.model.id !== requested.modelId || selection.model.provider !== requested.provider)
)
  throw new Error('The requested evaluation model is not available.')

describe('reader assistant against the real model', () => {
  it.each(scenarios)('$name', async scenario => {
    for (let index = 0; index < runs; index++) {
      const fixture = workspace()
      const calls: Call[] = []
      const agent = createReaderAgent(runtime, fixture.local, {
        id: `eval-${scenario.name}-${index}`,
        messages: [],
        ...selection,
      })
      let turns = 0
      const unsubscribe = agent.subscribe(event => {
        if (event.type === 'tool_execution_start')
          calls.push({ name: event.toolName, args: event.args })
        if (event.type === 'turn_start' && ++turns > 16) agent.abort()
      })
      const prompt = await scenario.prepare(fixture, agent)
      const started = Date.now()
      const timeout = setTimeout(() => agent.abort(), 180_000)
      let failure: string | undefined
      let requestError = false
      try {
        await agent.prompt(prompt)
        const last = agent.state.messages.at(-1)
        requestError = last?.role !== 'assistant' || last.stopReason !== 'stop'
        if (last?.role !== 'assistant' || requestError)
          throw new Error(
            last?.role === 'assistant'
              ? (last.errorMessage ?? last.stopReason)
              : 'No assistant response.',
          )
        const answer = last.content
          .flatMap(part => (part.type === 'text' ? [part.text] : []))
          .join('\n')
        await scenario.check({ workspace: fixture, calls, answer })
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error)
      } finally {
        clearTimeout(timeout)
        unsubscribe()
      }
      const row = {
        scenario: scenario.name,
        run: index + 1,
        status: requestError ? 'error' : failure ? 'fail' : 'pass',
        failure,
        provider: selection.model.provider,
        model: selection.model.id,
        ms: Date.now() - started,
        turns,
        tokens: agent.state.messages.reduce(
          (sum, message) => sum + (message.role === 'assistant' ? message.usage.totalTokens : 0),
          0,
        ),
        calls,
        messages: agent.state.messages,
      }
      process.stdout.write(`${scenario.name} #${index + 1}: ${row.status} (${row.tokens} tokens)\n`)
      if (process.env.GAMMA_EVAL_OUT)
        await appendFile(process.env.GAMMA_EVAL_OUT, `${JSON.stringify(row)}\n`)
      // Keep all repeated trials: a failure in the first trial must not hide the remaining runs.
      expect.soft(failure, `${scenario.name}, run ${index + 1}`).toBeUndefined()
      localStorage.clear()
      await deleteFileStore()
    }
  })
})
