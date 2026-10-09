import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { SaveResult, SourceListing } from '@gamma-reader/shared/source-protocol'
import { Hono } from 'hono'
import { afterAll, describe, expect, it } from 'vitest'
import { publishing } from './publish.js'
import { openRepository, type Source } from './repository.js'
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

describe('cloned source pushed to', () => {
  const remote = join(root, 'remote.git')
  const colleague = join(root, 'colleague')
  git(root, 'init', '-q', '--bare', '-b', 'main', remote)
  git(root, 'clone', '-q', remote, colleague)
  const share = (path: string, content: string) => {
    if (git(colleague, 'branch', '-r')) git(colleague, 'pull', '-q', '--ff-only')
    mkdirSync(dirname(join(colleague, path)), { recursive: true })
    writeFileSync(join(colleague, path), content)
    git(colleague, 'add', '-A')
    git(colleague, 'commit', '-qm', `colleague edits ${path}`)
    git(colleague, 'push', '-q', 'origin', 'HEAD:main')
  }
  share('notes/plan.md', 'one\ntwo\nthree\n')
  share('notes/other.md', 'other\n')

  const dir = join(root, 'pushed')
  const clone = openRepository({ repo: remote, dir, include: ['notes'] })
  const scope = { include: ['notes'], exclude: [] }
  const signedIn = { 'x-forwarded-user': 'ada', 'x-forwarded-email': 'ada@example.com' }

  const save = async (source: Source, path: string, base: string, content: string) => {
    const form = new FormData()
    form.append('c0', new Blob([content]))
    form.append('changes', JSON.stringify([{ kind: 'write', path, base, part: 'c0' }]))
    const routes = new Hono().route('/api/library', createRoutes(source))
    const response = await routes.request('/api/library/save', {
      method: 'POST',
      body: form,
      headers: signedIn,
    })
    return (await response.json()) as SaveResult[]
  }
  const versionOf = async (source: Source, path: string) =>
    (await source.listing()).files.find(file => file.path === path)?.version as string
  const upstreamLog = () => git(remote, 'log', '-1', '--format=%an <%ae>|%s')

  it('commits a save as the reader who signed in and pushes it', async () => {
    const source = publishing(clone, { dir, scope })
    await source.update()
    const base = await versionOf(source, 'notes/plan.md')

    const [result] = await save(source, 'notes/plan.md', base, 'one\ntwo\nthree\nfour\n')

    expect(result).toMatchObject({ kind: 'written', path: 'notes/plan.md' })
    expect(upstreamLog()).toBe('ada <ada@example.com>|Edit notes/plan.md in Gamma Reader')
    expect(git(remote, 'show', 'main:notes/plan.md')).toBe('one\ntwo\nthree\nfour')
    expect((await source.listing()).version).toBe(git(remote, 'rev-parse', 'main'))
  })

  it('hands a clash back to the reader and commits no markers', async () => {
    const source = publishing(clone, { dir, scope })
    const base = await versionOf(source, 'notes/plan.md')
    share('notes/plan.md', 'one, from a colleague\ntwo\nthree\nfour\n')
    const pushedByColleague = git(remote, 'rev-parse', 'main')

    const [result] = await save(source, 'notes/plan.md', base, 'one, from ada\ntwo\nthree\nfour\n')

    expect(result).toMatchObject({
      kind: 'conflicted',
      path: 'notes/plan.md',
      version: git(remote, 'rev-parse', 'main:notes/plan.md'),
    })
    if (result?.kind !== 'conflicted') throw new Error('The clash was handed back')
    expect(result.text).toContain('<<<<<<< reader\none, from ada\n')
    expect(result.text).toContain('>>>>>>> repository\n')
    expect(git(remote, 'rev-parse', 'main')).toBe(pushedByColleague)

    const unresolved = await save(source, 'notes/plan.md', result.version, result.text)
    expect(unresolved).toEqual([{ kind: 'skipped', path: 'notes/plan.md', reason: 'unresolved' }])
    expect(git(remote, 'rev-parse', 'main')).toBe(pushedByColleague)
  })

  it('replays a save on a commit pushed while it was being made', async () => {
    // A clone that missed the colleague's push, as one does when the push lands mid-save.
    const stale = publishing({ ...clone, update: async () => undefined }, { dir, scope })
    const base = await versionOf(stale, 'notes/other.md')
    share('notes/plan.md', 'pushed meanwhile\n')

    const [result] = await save(stale, 'notes/other.md', base, 'other, from ada\n')

    expect(result).toMatchObject({ kind: 'written', path: 'notes/other.md' })
    expect(git(remote, 'show', 'main:notes/other.md')).toBe('other, from ada')
    expect(git(remote, 'show', 'main:notes/plan.md')).toBe('pushed meanwhile')
  })
})
