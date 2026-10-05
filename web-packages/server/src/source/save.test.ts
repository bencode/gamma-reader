import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Hono } from 'hono'
import { afterAll, describe, expect, it } from 'vitest'
import type { SourceListing } from './repository.js'
import { createRoutes } from './routes.js'
import type { SaveResult } from './save.js'
import { openWorkingTree } from './working-tree.js'

const dir = mkdtempSync(join(tmpdir(), 'gamma-reader-save-'))
const elsewhere = mkdtempSync(join(tmpdir(), 'gamma-reader-elsewhere-'))
afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
  rmSync(elsewhere, { recursive: true, force: true })
})

const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args], {
    cwd: dir,
    encoding: 'utf8',
  })
const write = (path: string, content: string) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true })
  writeFileSync(join(dir, path), content)
}
const read = (path: string) => readFileSync(join(dir, path), 'utf8')

git('init', '-q', '-b', 'main')
write('notes/plain.md', 'one\ntwo\nthree\n')
write('notes/merged.md', 'one\ntwo\nthree\n')
write('notes/clash.md', 'one\ntwo\nthree\n')
write('notes/gone.md', 'gone\n')
write('notes/moved.md', 'moved\n')
write('notes/drop/only.md', 'drop\n')
write('notes/kept.md', 'kept\n')
write('meta/outside.md', 'outside\n')
git('add', '-A')
git('commit', '-qm', 'start')
// A folder inside the listed one that leads out of the working tree.
symlinkSync(elsewhere, join(dir, 'notes/link'))

const app = new Hono().route(
  '/api/library',
  createRoutes(await openWorkingTree({ dir, include: ['notes'] })),
)
const listing = async () => (await (await app.request('/api/library')).json()) as SourceListing
const synced = await listing()
const base = (path: string) => synced.files.find(file => file.path === path)?.version as string

type Change =
  | { kind: 'write'; path: string; base: string | null; content: string }
  | { kind: 'move'; from: string; to: string }
  | { kind: 'delete'; path: string; base: string }

// Sends changes as the reader does: one JSON list, each write's content in its own part.
const save = async (changes: Change[], to = app) => {
  const form = new FormData()
  const wire = changes.map((change, index) => {
    if (change.kind !== 'write') return change
    form.append(`c${index}`, new Blob([change.content]))
    return { kind: 'write', path: change.path, base: change.base, part: `c${index}` }
  })
  form.append('changes', JSON.stringify(wire))
  const response = await to.request('/api/library/save', { method: 'POST', body: form })
  expect(response.status).toBe(200)
  return (await response.json()) as SaveResult[]
}

describe('saving to a working tree', () => {
  it('lists each file under the git object of its content', () => {
    expect(base('notes/plain.md')).toBe(git('hash-object', '--no-filters', 'notes/plain.md').trim())
  })

  it('writes a file nobody else changed, and lists the version it reports', async () => {
    const [result] = await save([
      { kind: 'write', path: 'notes/plain.md', base: base('notes/plain.md'), content: 'one\n' },
    ])

    expect(result).toMatchObject({ kind: 'written', path: 'notes/plain.md' })
    expect(read('notes/plain.md')).toBe('one\n')
    const listed = (await listing()).files.find(file => file.path === 'notes/plain.md')
    expect(listed?.version).toBe(result && 'version' in result ? result.version : null)
  })

  it('merges with an edit made on disk meanwhile, and marks a clash on the same line', async () => {
    write('notes/merged.md', 'one\ntwo\nthree, from disk\n')
    write('notes/clash.md', 'one, from disk\ntwo\nthree\n')

    const results = await save([
      {
        kind: 'write',
        path: 'notes/merged.md',
        base: base('notes/merged.md'),
        content: 'one, from reader\ntwo\nthree\n',
      },
      {
        kind: 'write',
        path: 'notes/clash.md',
        base: base('notes/clash.md'),
        content: 'one, from reader\ntwo\nthree\n',
      },
    ])

    expect(results).toMatchObject([
      { kind: 'merged', path: 'notes/merged.md', conflicts: 0 },
      { kind: 'merged', path: 'notes/clash.md', conflicts: 1 },
    ])
    expect(read('notes/merged.md')).toBe('one, from reader\ntwo\nthree, from disk\n')
    expect(read('notes/clash.md')).toContain('<<<<<<< reader\none, from reader\n')
  })

  it('leaves a file alone when it was deleted on disk', async () => {
    rmSync(join(dir, 'notes/gone.md'))

    expect(
      await save([
        { kind: 'write', path: 'notes/gone.md', base: base('notes/gone.md'), content: 'x' },
      ]),
    ).toEqual([{ kind: 'skipped', path: 'notes/gone.md', reason: 'deleted-on-disk' }])
    expect(existsSync(join(dir, 'notes/gone.md'))).toBe(false)
  })

  it('moves before it writes, deletes what is unchanged, and keeps what someone edited', async () => {
    write('notes/kept.md', 'kept, edited on disk\n')

    const results = await save([
      { kind: 'delete', path: 'notes/drop/only.md', base: base('notes/drop/only.md') },
      { kind: 'delete', path: 'notes/kept.md', base: base('notes/kept.md') },
      {
        kind: 'write',
        path: 'notes/archive/moved.md',
        base: base('notes/moved.md'),
        content: 'moved, edited\n',
      },
      { kind: 'move', from: 'notes/moved.md', to: 'notes/archive/moved.md' },
    ])

    expect(results).toMatchObject([
      { kind: 'moved', from: 'notes/moved.md', path: 'notes/archive/moved.md' },
      { kind: 'written', path: 'notes/archive/moved.md' },
      { kind: 'deleted', path: 'notes/drop/only.md' },
      { kind: 'skipped', path: 'notes/kept.md', reason: 'changed-on-disk' },
    ])
    expect(read('notes/archive/moved.md')).toBe('moved, edited\n')
    expect(existsSync(join(dir, 'notes/moved.md'))).toBe(false)
    expect(existsSync(join(dir, 'notes/drop'))).toBe(false)
    expect(read('notes/kept.md')).toBe('kept, edited on disk\n')
  })

  it('refuses paths outside the listed folders or the working tree', async () => {
    expect(
      await save([
        { kind: 'write', path: 'meta/outside.md', base: null, content: 'x' },
        { kind: 'write', path: 'notes/../meta/outside.md', base: null, content: 'x' },
        { kind: 'write', path: 'notes/link/escape.md', base: null, content: 'x' },
        { kind: 'move', from: 'notes/plain.md', to: 'notes/.git/plain.md' },
      ]),
    ).toEqual([
      { kind: 'skipped', path: 'notes/.git/plain.md', reason: 'invalid-path' },
      { kind: 'skipped', path: 'meta/outside.md', reason: 'invalid-path' },
      { kind: 'skipped', path: 'notes/../meta/outside.md', reason: 'invalid-path' },
      { kind: 'skipped', path: 'notes/link/escape.md', reason: 'invalid-path' },
    ])
    expect(read('meta/outside.md')).toBe('outside\n')
    expect(existsSync(join(elsewhere, 'escape.md'))).toBe(false)
  })

  it('rejects a request it cannot read', async () => {
    const form = new FormData()
    form.append('changes', JSON.stringify([{ kind: 'write', path: 'notes/plain.md' }]))

    expect((await app.request('/api/library/save', { method: 'POST', body: form })).status).toBe(
      400,
    )
  })

  it('saves anywhere in a whole repository but its hidden and excluded folders', async () => {
    const whole = new Hono().route(
      '/api/library',
      createRoutes(await openWorkingTree({ dir, include: [], exclude: ['meta'] })),
    )
    const results = await save(
      [
        { kind: 'write', path: 'sun-earth-moon/orbit.p5.js', base: null, content: 'orbit\n' },
        { kind: 'write', path: 'meta/new.md', base: null, content: 'meta\n' },
        { kind: 'write', path: '.claude/settings.md', base: null, content: 'hidden\n' },
      ],
      whole,
    )

    expect(results.map(result => `${result.path} ${result.kind}`)).toEqual([
      'sun-earth-moon/orbit.p5.js written',
      'meta/new.md skipped',
      '.claude/settings.md skipped',
    ])
    expect(read('sun-earth-moon/orbit.p5.js')).toBe('orbit\n')
    expect(existsSync(join(dir, 'meta/new.md'))).toBe(false)
    expect(existsSync(join(dir, '.claude/settings.md'))).toBe(false)
  })
})
