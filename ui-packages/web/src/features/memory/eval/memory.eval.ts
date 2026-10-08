import { describe, expect, it } from 'vitest'
import { runBackgroundAgent } from '../../../core/agent/background'
import { workspaceDatabaseName } from '../../../data/workspace-database'
import { curatorAgent } from '../curator/agent'
import { abstractAgent, tidyAgent } from '../dream/agents'
import { listMemories, listTags, readProgress } from '../store'
import { projectKey, subjectOf, tidiedIds } from './dataset'
import { measureAbstract, measureCurator, measureTidy } from './measure'
import { report, reset, runs, seedConversations, seedMemos } from './run'
import { large } from './sets/large'
import { small } from './sets/small'

// S is quick enough for every change; L, with hundreds of notes, is for changes to how the agents
// find their work.
const dataset = process.env.GAMMA_EVAL_SET === 'L' ? large : small

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

describe(`memory agents against the real model, set ${dataset.name}`, () => {
  it('starts from a dataset that says what it means', () => {
    const ids = dataset.memos.map(seed => seed.id)
    const { expect: planted } = dataset
    const named = [
      ...planted.duplicateGroups.flat(),
      ...planted.decoyPairs.flat(),
      ...planted.patterns.flat(),
      ...planted.preferenceIds,
      ...planted.standalone,
      ...planted.existingAbstractions,
      ...dataset.memos.flatMap(seed => seed.derivedFrom ?? []),
    ]
    expect(new Set(ids).size).toBe(ids.length)
    expect(named.filter(id => !ids.includes(id))).toEqual([])
    expect(planted.duplicateGroups.every(group => group.length >= 2)).toBe(true)
    expect(ids.filter(id => subjectOf(dataset, id) === 'unknown')).toEqual([])
    const tagNames = dataset.tags.map(tag => tag.name)
    expect(
      dataset.memos.flatMap(seed => seed.tags).filter(name => !tagNames.includes(name)),
    ).toEqual([])
    const conversationIds = dataset.conversations.map(item => item.id)
    expect(new Set(conversationIds).size).toBe(conversationIds.length)
  })

  it('curator: conversations into notes', async () => {
    const rows = await repeat(async () => {
      const counts = await seedConversations(dataset)
      const run = await runBackgroundAgent(curatorAgent, workspaceDatabaseName(), {
        untilDone: true,
      })
      const progress = await readProgress(projectKey)
      return {
        ...spent(run),
        ...measureCurator(dataset, await listMemories(), await listTags(), progress, counts),
      }
    })
    await report(`curator, set ${dataset.name}`, rows)
  })

  it('tidy: duplicates, decoys and synonym tags', async () => {
    const rows = await repeat(async () => {
      await seedMemos(
        dataset,
        dataset.memos.map(seed => seed.id),
      )
      const run = await runBackgroundAgent(tidyAgent, workspaceDatabaseName())
      return { ...spent(run), ...measureTidy(dataset, await listMemories(), await listTags()) }
    })
    await report(`tidy, set ${dataset.name}`, rows)
  })

  it('abstract: patterns across tidy notes', async () => {
    const rows = await repeat(async () => {
      await seedMemos(dataset, tidiedIds(dataset))
      const run = await runBackgroundAgent(abstractAgent, workspaceDatabaseName())
      return { ...spent(run), ...measureAbstract(dataset, await listMemories()) }
    })
    await report(`abstract, set ${dataset.name}`, rows)
  })
})
