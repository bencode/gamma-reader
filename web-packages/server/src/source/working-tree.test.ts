import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Hono } from 'hono'
import { afterAll, describe, expect, it } from 'vitest'
import type { SourceListing } from './repository.js'
import { createRoutes } from './routes.js'
import { openWorkingTree } from './working-tree.js'

const dir = mkdtempSync(join(tmpdir(), 'gamma-reader-worktree-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args], {
    cwd: dir,
  })

const write = (path: string, content: string) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true })
  writeFileSync(join(dir, path), content)
}

git('init', '-q', '-b', 'main')
write('.gitignore', 'knowledge/out/\n')
write('knowledge/agents.md', '# Agents')
write('knowledge/gone.md', '# Gone')
write('meta/index.json', '{}')
git('add', '-A')
git('commit', '-qm', 'start')
// Edited, removed and added after the commit, none of it committed.
write('knowledge/新 笔记.md', '# 笔记')
write('knowledge/out/build.md', '# Built')
rmSync(join(dir, 'knowledge/gone.md'))

const app = new Hono().route(
  '/api/library',
  createRoutes(openWorkingTree({ dir, include: ['knowledge'] })),
)
const listing = async () => (await (await app.request('/api/library')).json()) as SourceListing
const fileUrl = (path: string) =>
  `/api/library/files/${path.split('/').map(encodeURIComponent).join('/')}`

describe('working tree source', () => {
  it('lists the files on disk that git keeps, committed or not', async () => {
    expect((await listing()).files.map(file => file.path)).toEqual([
      'knowledge/agents.md',
      'knowledge/新 笔记.md',
    ])
    expect(await (await app.request(fileUrl('knowledge/新 笔记.md'))).text()).toBe('# 笔记')
    for (const path of ['knowledge/out/build.md', 'meta/index.json', 'knowledge/gone.md'])
      expect((await app.request(fileUrl(path))).status).toBe(404)
  })

  it('lists the whole repository when no folder is named', async () => {
    const { files } = await openWorkingTree({ dir, include: [] }).listing()

    expect(files.map(file => file.path)).toEqual([
      '.gitignore',
      'knowledge/agents.md',
      'knowledge/新 笔记.md',
      'meta/index.json',
    ])
  })

  it('changes versions when a file is saved, without a commit', async () => {
    const before = await listing()
    write('knowledge/agents.md', '# Agents, revised')

    const after = await listing()

    expect(after.version).not.toBe(before.version)
    expect(after.files.find(file => file.path === 'knowledge/agents.md')?.version).not.toBe(
      before.files.find(file => file.path === 'knowledge/agents.md')?.version,
    )
    expect(await (await app.request(fileUrl('knowledge/agents.md'))).text()).toBe(
      '# Agents, revised',
    )
  })
})
