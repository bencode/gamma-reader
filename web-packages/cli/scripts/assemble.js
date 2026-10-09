// Copies the built server, the built web app and the tutorial into this package, laid out as in
// the repository and the container image, where the server finds the other two beside it.
// The license comes along for npm to ship. With --remove, after packing, the copies go away.
import { access, cp, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const repository = new URL('../../../', import.meta.url)
const pkg = new URL('../', import.meta.url)
const parts = ['web-packages/server/dist', 'ui-packages/web/dist', 'tutorial', 'LICENSE']

const at = path => fileURLToPath(new URL(path, pkg))

if (process.argv.includes('--remove')) {
  const tops = new Set(parts.map(part => part.split('/')[0]))
  await Promise.all([...tops].map(top => rm(at(top), { recursive: true, force: true })))
} else {
  for (const part of parts) {
    const from = fileURLToPath(new URL(part, repository))
    await access(from).catch(cause => {
      throw new Error(`${part} is missing. Run pnpm build first.`, { cause })
    })
    await rm(at(part), { recursive: true, force: true })
    await cp(from, at(part), { recursive: true })
  }
}
