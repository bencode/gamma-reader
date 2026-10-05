import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Hono } from 'hono'
import { afterAll, describe, expect, it } from 'vitest'
import { openDirectory } from './directory.js'
import type { SourceListing } from './repository.js'
import { createRoutes } from './routes.js'

const dir = mkdtempSync(join(tmpdir(), 'gamma-reader-directory-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const write = (path: string, content: string) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true })
  writeFileSync(join(dir, path), content)
}

write('Start here.md', '# Start')
write('labs/Wave.lab.md', '# Wave')
write('.DS_Store', 'hidden')
write('.hidden/secret.md', 'hidden')

const app = new Hono().route('/api/tutorial', createRoutes(openDirectory(dir)))
const listing = async () => (await (await app.request('/api/tutorial')).json()) as SourceListing
const file = (path: string) =>
  app.request(`/api/tutorial/files/${path.split('/').map(encodeURIComponent).join('/')}`)

describe('directory source', () => {
  it('lists every file but hidden ones, and serves each by its path', async () => {
    const { files } = await listing()

    expect(files.map(entry => entry.path)).toEqual(['Start here.md', 'labs/Wave.lab.md'])
    expect(await (await file('labs/Wave.lab.md')).text()).toBe('# Wave')
  })

  it('changes the version of a file and of the listing when the file changes', async () => {
    const before = await listing()
    write('Start here.md', '# Start again')
    const after = await listing()

    expect(after.version).not.toBe(before.version)
    expect(after.files[0]?.version).not.toBe(before.files[0]?.version)
    expect(after.files[1]).toEqual(before.files[1])
  })

  it('serves nothing it did not list', async () => {
    expect((await file('.DS_Store')).status).toBe(404)
    expect((await file('../outside.md')).status).toBe(404)
    expect((await file('missing.md')).status).toBe(404)
  })
})
