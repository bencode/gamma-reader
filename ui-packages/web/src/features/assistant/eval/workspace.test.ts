import { describe, expect, it } from 'vitest'
import { getStoredFileContent } from '../../../data/file-store'
import { workspace } from './workspace'

describe('assistant evaluation workspace', () => {
  it('executes the edited draft while keeping the saved file intact', async () => {
    const { local, seed } = workspace()
    const saved = '```typescript run\n[1, 2].reduce((a, b) => a + b, 0)\n```'
    const fileId = await seed('Sum.lab.md', saved)
    await local.open({ fileId })
    const draft = local.read_active_source()
    local.edit_active_source({
      fileId,
      expectedVersion: draft.version,
      oldText: '[1, 2]',
      newText: '[20, 22]',
    })

    const result = await local.run_active_lab_cells({})

    expect(result.cells).toMatchObject([
      { status: 'succeeded', language: 'typescript', outputs: [{ kind: 'text', text: '42' }] },
    ])
    expect(await (await getStoredFileContent(fileId))?.text()).toBe(saved)
    expect(local.read_active_source().content).toContain('[20, 22]')

    local.edit_active_source({
      fileId,
      expectedVersion: local.read_active_source().version,
      oldText: '[20, 22]',
      newText: '[20, 23]',
    })
    expect(local.read_active_lab_cells({}).cells).toMatchObject([{ stale: true }])
  })

  it('reports typeset output returned by a TypeScript cell', async () => {
    const { local, seed } = workspace()
    const fileId = await seed(
      'Formula.lab.md',
      "```typescript run\nreturn { toLatex: () => 'x^2 + y^2 = z^2' }\n```",
    )
    await local.open({ fileId })

    expect((await local.run_active_lab_cells({})).cells).toMatchObject([
      { status: 'succeeded', outputs: [{ kind: 'latex', text: 'x^2 + y^2 = z^2' }] },
    ])
  })
})
