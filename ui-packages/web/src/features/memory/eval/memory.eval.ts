import { describe, it } from 'vitest'
import { runBackgroundAgent } from '../../agent/background'
import { curatorAgent } from '../curator/agent'
import { abstractAgent, tidyAgent } from '../dream/agents'
import { listMemories, listTags, readProgress } from '../store'
import { memos, projectKey, tidiedIds } from './dataset'
import { measureAbstract, measureCurator, measureTidy } from './measure'
import { report, reset, runs, seedConversations, seedMemos } from './run'

// Each scenario runs the agent against the real model several times from the same start, so a
// change to an agent can be judged by how its numbers move rather than by one lucky run.
const repeat = async <T>(scenario: () => Promise<T>) => {
  const rows: T[] = []
  for (let index = 0; index < runs; index++) {
    await reset()
    rows.push(await scenario())
  }
  return rows
}

const spent = (run: Awaited<ReturnType<typeof runBackgroundAgent>>) => ({
  run: run?.stoppedBy ?? 'done',
  turns: run?.turns ?? 0,
  tokens: run?.tokens ?? 0,
})

describe('memory agents against the real model', () => {
  it('curator: conversations into notes', async () => {
    const rows = await repeat(async () => {
      const counts = await seedConversations()
      const run = await runBackgroundAgent(curatorAgent, { untilDone: true })
      return {
        ...spent(run),
        ...measureCurator(
          await listMemories(),
          await listTags(),
          await readProgress(projectKey),
          counts,
        ),
      }
    })
    await report('curator', rows)
  })

  it('tidy: duplicates, decoys and synonym tags', async () => {
    const rows = await repeat(async () => {
      await seedMemos(memos.map(seed => seed.id))
      const run = await runBackgroundAgent(tidyAgent)
      return { ...spent(run), ...measureTidy(await listMemories(), await listTags()) }
    })
    await report('tidy', rows)
  })

  it('abstract: patterns across tidy notes', async () => {
    const rows = await repeat(async () => {
      await seedMemos(tidiedIds)
      const run = await runBackgroundAgent(abstractAgent)
      return { ...spent(run), ...measureAbstract(await listMemories()) }
    })
    await report('abstract', rows)
  })
})
