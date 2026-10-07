import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalToolError } from '../../agent/tool-types'
import { runTool } from '../curator/fixtures'
import type { MemoryEntry } from '../entry'
import { setMemoryEnabled } from '../settings'
import { listMemories, listTags, restoreMerged, saveMemory, saveTag } from '../store'
import { createMemoryTools } from '../tools'
import { createAbstractTools, createTidyTools } from './tools'

const project = 'gamma-reader-project-sicp'
const note = (id: string, text: string, fields: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id,
  text,
  scope: 'project',
  core: false,
  projectKey: project,
  conversationId: id,
  createdAt: 0,
  updatedAt: 0,
  confirmedAt: 0,
  tags: ['SICP'],
  sources: [{ projectKey: project, conversationId: id, from: 0, to: 3 }],
  ...fields,
})
const recall = async (queries: string[]) =>
  (
    await runTool(
      createMemoryTools({ projectKey: project, conversationId: 'c' }),
      'recall_memory',
      {
        queries,
      },
    )
  ).entries.map((entry: { id: string }) => entry.id)

describe('dream tools', () => {
  beforeEach(async () => {
    setMemoryEnabled(true)
    await saveTag({ name: 'SICP', aliases: [], description: '' })
  })
  afterEach(() => setMemoryEnabled(false))

  it('merges notes on one topic, keeps their sources, and lets the reader undo it', async () => {
    await saveMemory(note('a', '读者在读 SICP 1.2，尾递归不懂'))
    await saveMemory(note('b', '读者在读 SICP 1.2，尾递归已懂'))
    const tidy = createTidyTools(project)

    const { id } = await runTool(tidy, 'merge_memos', {
      ids: ['a', 'b'],
      text: '读者读完 SICP 1.2，已掌握尾递归',
      tags: ['SICP'],
    })

    const merged = (await listMemories()).find(entry => entry.id === id)
    expect(merged?.sources.map(source => source.conversationId)).toEqual(['a', 'b'])
    expect(await recall(['SICP'])).toEqual([id])
    await restoreMerged('a')
    expect((await recall(['SICP'])).toSorted()).toEqual(['a', id].toSorted())
  })

  it('does not merge a note about the reader with one about the project', async () => {
    await saveMemory(note('a', 'Prefers Scheme examples', { scope: 'reader' }))
    await saveMemory(note('b', 'Reading SICP'))
    await expect(
      runTool(createTidyTools(project), 'merge_memos', {
        ids: ['a', 'b'],
        text: 'x',
        tags: ['SICP'],
      }),
    ).rejects.toBeInstanceOf(LocalToolError)
  })

  it('folds one tag into another, notes and aliases included', async () => {
    await saveTag({ name: '尾调用', aliases: ['tail call'], description: '' })
    await saveTag({ name: '尾递归', aliases: [], description: 'Tail recursion' })
    await saveMemory(note('a', 'Stuck on tail calls', { tags: ['尾调用', 'SICP'] }))

    await runTool(createTidyTools(project), 'merge_tags', { from: '尾调用', into: '尾递归' })

    expect((await listMemories())[0]?.tags).toEqual(['尾递归', 'SICP'])
    expect((await listTags()).find(tag => tag.name === '尾递归')?.aliases).toEqual([
      '尾调用',
      'tail call',
    ])
  })

  it('draws an abstraction that points to its notes and leaves them as they were', async () => {
    await saveMemory(note('a', '换零钱的树形递归靠调用树图示才懂'))
    await saveMemory(note('b', '汉诺塔看了动画才明白'))
    const abstract = createAbstractTools(project)

    const { id } = await runTool(abstract, 'derive_memo', {
      fromIds: ['a', 'b'],
      text: '读者理解递归类概念需要图示',
      tags: ['SICP'],
      scope: 'reader',
    })

    const entries = await listMemories()
    expect(entries.find(entry => entry.id === id)).toMatchObject({
      derivedFrom: ['a', 'b'],
      sources: [],
      scope: 'reader',
    })
    expect(entries.filter(entry => entry.id !== id).map(entry => entry.text)).toEqual([
      '换零钱的树形递归靠调用树图示才懂',
      '汉诺塔看了动画才明白',
    ])
    await expect(
      runTool(abstract, 'update_derived', { id: 'a', text: 'rewritten' }),
    ).rejects.toBeInstanceOf(LocalToolError)
  })
})
