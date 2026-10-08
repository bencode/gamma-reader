import { appendFile } from 'node:fs/promises'
import { deleteFileStore } from '../../../data/file-store'
import { seedConversation } from '../curator/fixtures'
import { setMemoryEnabled } from '../settings'
import { deleteMemoryStore, saveMemory, saveTag } from '../store'
import { type Dataset, memoEntry } from './dataset'

export const runs = Number(process.env.GAMMA_EVAL_RUNS ?? 3)

// Each run starts from nothing: no notes, no conversations, no record of earlier runs.
export const reset = async () => {
  localStorage.clear()
  await deleteMemoryStore()
  await deleteFileStore()
  setMemoryEnabled(true)
}

export const seedMemos = async (dataset: Dataset, ids: readonly string[]) => {
  await Promise.all(dataset.tags.map(saveTag))
  await Promise.all(
    dataset.memos.flatMap((seed, index) =>
      ids.includes(seed.id) ? [saveMemory(memoEntry(seed, index))] : [],
    ),
  )
}

const hourAgo = () => Date.now() - 60 * 60 * 1000

export const seedConversations = async ({ conversations }: Dataset) => {
  for (const { id, messages } of conversations) await seedConversation(id, hourAgo(), messages)
  return new Map(conversations.map(({ id, messages }) => [id, messages.length]))
}

type Row = Record<string, unknown>

const mean = (rows: readonly Row[], key: string) => {
  const values = rows.map(row => row[key])
  if (values.every(value => typeof value === 'number'))
    return (values as number[]).reduce((sum, value) => sum + value, 0) / values.length
  if (values.every(value => typeof value === 'boolean'))
    return values.filter(Boolean).length / values.length
  return undefined
}

// One table per scenario: every run, then the mean of what can be averaged.
export const report = async (scenario: string, rows: readonly Row[]) => {
  const keys = [...new Set(rows.flatMap(row => Object.keys(row)))]
  const scalar = (row: Row) =>
    Object.fromEntries(keys.filter(key => !Array.isArray(row[key])).map(key => [key, row[key]]))
  const average = Object.fromEntries(
    keys.flatMap(key => {
      const value = mean(rows, key)
      return value === undefined ? [] : [[key, Math.round(value * 100) / 100]]
    }),
  )
  const table = [...rows.map(scalar), { ...average, run: 'mean' }]
  const columns = [...new Set(table.flatMap(row => Object.keys(row)))]
  const cells = [columns, ...table.map(row => columns.map(column => String(row[column] ?? '')))]
  const widths = columns.map((_, index) => Math.max(...cells.map(line => line[index]?.length ?? 0)))
  const lines = cells.map(line =>
    line.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join('  '),
  )
  const lists = rows.flatMap((row, index) =>
    Object.entries(row).flatMap(([key, value]) =>
      Array.isArray(value) ? [`run ${index + 1} ${key}: ${JSON.stringify(value)}`] : [],
    ),
  )
  // Vitest keeps console output from passing tests to itself, and the report is why a run exists.
  process.stdout.write(`\n== ${scenario}\n${[...lines, ...lists].join('\n')}\n`)
  const out = process.env.GAMMA_EVAL_OUT
  if (out)
    await appendFile(
      out,
      `${JSON.stringify({ scenario, at: new Date().toISOString(), rows, average })}\n`,
    )
}
