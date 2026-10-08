import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { SourceListing } from '@gamma-reader/shared/source-protocol'
import { Hono } from 'hono'
import { afterAll, describe, expect, it } from 'vitest'
import { openRepository } from './repository.js'
import { createRoutes } from './routes.js'

const root = mkdtempSync(join(tmpdir(), 'gamma-reader-clone-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const upstream = join(root, 'upstream')
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args], {
    cwd,
    encoding: 'utf8',
  }).trim()

const commit = (files: Record<string, string>) => {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(upstream, path)), { recursive: true })
    writeFileSync(join(upstream, path), content)
  }
  git(upstream, 'add', '-A')
  git(upstream, 'commit', '-qm', 'update')
  return git(upstream, 'rev-parse', 'HEAD')
}

mkdirSync(upstream)
git(upstream, 'init', '-q', '-b', 'main')
const first = commit({
  'knowledge/agents.md': '# Agents',
  'knowledge/学习 笔记.md': '# 笔记',
  'assets/paper.pdf': '%PDF-1.7',
  'meta/index.json': '{}',
  '.github/ci.yml': 'on: push',
})

const repository = openRepository({
  repo: upstream,
  dir: join(root, 'clone'),
  include: ['knowledge', 'assets'],
})
const app = new Hono().route('/api/library', createRoutes(repository))
const listing = async () => (await (await app.request('/api/library')).json()) as SourceListing
const fileUrl = (path: string) =>
  `/api/library/files/${path.split('/').map(encodeURIComponent).join('/')}`

describe('cloned source', () => {
  it('lists the included folders at the current commit', async () => {
    await repository.update()

    const { version, files } = await listing()

    expect(version).toBe(first)
    expect(files.map(file => file.path).sort()).toEqual([
      'assets/paper.pdf',
      'knowledge/agents.md',
      'knowledge/学习 笔记.md',
    ])
    expect(files.find(file => file.path === 'assets/paper.pdf')).toEqual({
      path: 'assets/paper.pdf',
      version: git(upstream, 'rev-parse', 'HEAD:assets/paper.pdf'),
      size: 8,
    })
  })

  it('serves listed files by their encoded path and nothing else', async () => {
    const paper = await app.request(fileUrl('assets/paper.pdf'))
    expect(paper.headers.get('content-type')).toBe('application/pdf')
    expect(await paper.text()).toBe('%PDF-1.7')
    expect(await (await app.request(fileUrl('knowledge/学习 笔记.md'))).text()).toBe('# 笔记')

    for (const path of [fileUrl('meta/index.json'), '/api/library/files/../meta/index.json'])
      expect((await app.request(path)).status).toBe(404)
    expect((await app.request('/api/library/files/knowledge/%E0')).status).toBe(404)
  })

  it('follows new commits once updated', async () => {
    const second = commit({ 'knowledge/agents.md': '# Agents, revised' })

    expect((await listing()).version).toBe(first)
    await repository.update()

    expect((await listing()).version).toBe(second)
    expect(await (await app.request(fileUrl('knowledge/agents.md'))).text()).toBe(
      '# Agents, revised',
    )
  })

  it('refuses a clone of another repository', async () => {
    const other = join(root, 'other')
    const elsewhere = openRepository({ repo: other, dir: join(root, 'clone'), include: [] })

    await expect(elsewhere.update()).rejects.toThrow(`holds a clone of ${upstream}, not ${other}`)
  })

  it('holds the whole repository but its excluded folders and hidden files', async () => {
    const whole = openRepository({
      repo: upstream,
      dir: join(root, 'whole'),
      include: [],
      exclude: ['meta'],
    })
    await whole.update()

    const paths = (await whole.listing()).files.map(file => file.path).sort()
    expect(paths).toEqual(['assets/paper.pdf', 'knowledge/agents.md', 'knowledge/学习 笔记.md'])
    expect(await whole.blob('meta/index.json')).toBeNull()
  })
})
