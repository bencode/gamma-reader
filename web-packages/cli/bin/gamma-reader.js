#!/usr/bin/env node
// Serves a git working tree to Gamma Reader on this machine: the reader opens it as a project,
// offers each change on disk, and saves edits back to the folder.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const usage = `Usage: gamma-reader [folder] [options]

Serves a git working tree, the current folder by default, at http://127.0.0.1:3302.

Options:
  --name <name>        Project name, the folder's name by default
  --include <folders>  Only these folders, comma separated
  --exclude <folders>  Leave these folders out, comma separated
  --port <port>        Port to serve on, 3302 by default
  -h, --help           Show this help
  -v, --version        Show the version

Chat uses GLM_API_KEY or DEEPSEEK_API_KEY from the environment, or a model added in the reader.`

const fail = message => {
  console.error(`gamma-reader: ${message}`)
  process.exit(1)
}

const parse = () => {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        name: { type: 'string' },
        include: { type: 'string' },
        exclude: { type: 'string' },
        port: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    })
  } catch (cause) {
    fail(`${cause.message}\n\n${usage}`)
  }
}

const { values, positionals } = parse()
if (values.help) {
  console.info(usage)
  process.exit(0)
}
if (values.version) {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  console.info(pkg.version)
  process.exit(0)
}
if (positionals.length > 1) fail(`give one folder.\n\n${usage}`)

const dir = resolve(positionals[0] ?? '.')
try {
  execFileSync('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' })
} catch (cause) {
  if (cause.code === 'ENOENT')
    fail('git is not installed; the reader lists and saves files with it.')
  fail(`${dir} is not a git working tree.`)
}

// Options given here win over the environment, which wins over these defaults.
const settings = {
  NODE_ENV: 'production',
  GAMMA_SOURCE_NAME: values.name ?? process.env.GAMMA_SOURCE_NAME ?? basename(dir),
  GAMMA_SOURCE_WORKTREE: dir,
  GAMMA_SOURCE_INCLUDE: values.include ?? process.env.GAMMA_SOURCE_INCLUDE,
  GAMMA_SOURCE_EXCLUDE: values.exclude ?? process.env.GAMMA_SOURCE_EXCLUDE,
  PORT: values.port ?? process.env.PORT,
  GAMMA_DATA_DIR: process.env.GAMMA_DATA_DIR ?? join(homedir(), '.gamma-reader'),
}
// Only one source is served, so a repository or address set for a deployment does not apply.
delete process.env.GAMMA_SOURCE_REPO
delete process.env.GAMMA_SOURCE_URL
for (const [name, value] of Object.entries(settings))
  if (value !== undefined) process.env[name] = value

await import('../web-packages/server/dist/main.js')
