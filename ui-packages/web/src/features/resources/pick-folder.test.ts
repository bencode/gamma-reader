import { describe, expect, it } from 'vitest'
import { entriesFromInput, readPickedFolder } from './pick-folder'

type Tree = { [name: string]: Tree | string }

// Mirrors a directory handle closely enough to walk: folders list their entries, files open.
const folder = (name: string, tree: Tree, opened: string[]): FileSystemDirectoryHandle => {
  const handles = Object.entries(tree).map(([child, value]) =>
    typeof value === 'string'
      ? { kind: 'file', name: child, getFile: async () => new File([value], child) }
      : folder(child, value, opened),
  )
  return {
    kind: 'directory',
    name,
    async *values() {
      opened.push(name)
      yield* handles
    },
  } as unknown as FileSystemDirectoryHandle
}

describe('picking a folder', () => {
  it('never enters ignored folders and keeps the chosen folder name in each path', async () => {
    const opened: string[] = []
    const root = folder(
      'repo',
      { 'index.ts': 'a', node_modules: { lib: { 'index.js': 'b' } }, src: { 'app.ts': 'c' } },
      opened,
    )

    const entries = await readPickedFolder(root as Parameters<typeof readPickedFolder>[0])

    expect(entries.map(item => item.path)).toEqual(['repo/index.ts', 'repo/src/app.ts'])
    expect(opened).toEqual(['repo', 'src'])
  })

  it('stops walking once the folder is known to hold more than a thousand files', async () => {
    const opened: string[] = []
    const many = Object.fromEntries(Array.from({ length: 1001 }, (_, i) => [`f${i}.txt`, 'x']))
    const root = folder('repo', { a: many, b: { 'late.txt': 'x' } }, opened)

    const entries = await readPickedFolder(root as Parameters<typeof readPickedFolder>[0])

    expect(entries).toHaveLength(1001)
    expect(opened).not.toContain('b')
  })

  it('reads a folder chosen through an input by each file’s relative path', () => {
    const file = new File(['x'], 'app.ts')
    Object.defineProperty(file, 'webkitRelativePath', { value: 'repo/src/app.ts' })

    expect(entriesFromInput([file])).toEqual([{ path: 'repo/src/app.ts', file }])
  })
})
