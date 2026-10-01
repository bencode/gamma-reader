import {
  type AgentHarnessToolInvocation,
  createWriteTool,
  TODO_CONTEXT,
  withAbortSignal,
} from '@earendil-works/pi-agent-core'
import { describe, expect, it, vi } from 'vitest'
import { rootSources } from '../../core/files'
import {
  getStoredFileContent,
  importStoredFiles,
  listStoredFiles,
  writeStoredTextFile,
} from '../../data/file-store'
import { createWorkspaceWriteEnv } from './workspace-write-env'

const executeWrite = async (path: string, content: string, signal?: AbortSignal) => {
  const tool = createWriteTool()
  const id = 'write-fixture'
  const invocation: AgentHarnessToolInvocation = {
    invocationId: id,
    operationId: id,
    turnId: id,
    getMemo: async () => undefined,
    setMemo: async () => undefined,
  }
  const context = signal ? withAbortSignal(signal, TODO_CONTEXT) : TODO_CONTEXT
  return tool.execute(
    id,
    { path, content },
    () => undefined,
    { env: createWorkspaceWriteEnv(writeStoredTextFile) },
    invocation,
    context,
  )
}

describe('browser workspace write environment', () => {
  it('uses Pi write to create and completely replace UTF-8 text files', async () => {
    const created = await executeWrite('Study notes.md', '# 第一版')
    expect(created.content).toEqual([
      { type: 'text', text: 'Successfully wrote to Study notes.md' },
    ])
    const first = (await listStoredFiles()).find(file => file.path === 'Study notes.md')
    if (!first) throw new Error('Written file is missing')
    expect(first).toMatchObject({ collection: 'files', previewKind: 'markdown', revision: 1 })
    expect(first.size).toBe(new TextEncoder().encode('# 第一版').byteLength)

    await executeWrite('/workspace/study NOTES.md', '# Final')
    const second = (await listStoredFiles()).find(file => file.id === first.id)
    expect(second).toMatchObject({ path: 'study NOTES.md', revision: 2 })
    expect(await (await getStoredFileContent(first.id))?.text()).toBe('# Final')
  })

  it('supports text-based formats and preserves an overwritten attachment reference', async () => {
    await executeWrite('report.html', '<main>Report</main>')
    await executeWrite('component.tsx', 'export const Value = 1')
    const attachment = await importStoredFiles(
      rootSources([new File(['draft'], 'chat.txt', { type: 'text/plain' })]),
      'keep',
      'attachments',
    )
    const attachmentId = attachment.addedIds[0]
    if (!attachmentId) throw new Error('Attachment fixture is missing')
    await executeWrite('chat.txt', 'revised')

    const files = await listStoredFiles()
    expect(files.find(file => file.path === 'report.html')?.previewKind).toBe('html')
    expect(files.find(file => file.path === 'component.tsx')?.previewKind).toBe('text')
    expect(files.find(file => file.id === attachmentId)).toMatchObject({
      collection: 'attachments',
      revision: 2,
    })
  })

  it('writes into folders named by the path', async () => {
    await executeWrite('/workspace/docs/notes.md', '# Nested')

    const nested = (await listStoredFiles()).find(file => file.path === 'docs/notes.md')
    if (!nested) throw new Error('Nested file is missing')
    expect(await (await getStoredFileContent(nested.id))?.text()).toBe('# Nested')
    await expect(executeWrite('docs', 'blocked')).rejects.toThrow('where a folder is')
  })

  it('rejects traversal and external paths, binary writes and cancelled calls', async () => {
    for (const path of ['../outside.md', 'docs/../outside.md', '/outside.md', 'docs//a.md'])
      await expect(executeWrite(path, 'blocked')).rejects.toThrow('without parent traversal')

    const env = createWorkspaceWriteEnv(writeStoredTextFile)
    await expect(
      env.writeFile('binary.png', new Uint8Array([1]), TODO_CONTEXT),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'not_supported' },
    })
    const writer = vi.fn(writeStoredTextFile)
    const controller = new AbortController()
    controller.abort()
    const context = withAbortSignal(controller.signal, TODO_CONTEXT)
    await expect(
      createWriteTool().execute(
        'cancelled',
        { path: 'cancelled.md', content: 'not written' },
        () => undefined,
        { env: createWorkspaceWriteEnv(writer) },
        {
          invocationId: 'cancelled',
          operationId: 'cancelled',
          turnId: 'cancelled',
          getMemo: async () => undefined,
          setMemo: async () => undefined,
        },
        context,
      ),
    ).rejects.toThrow()
    expect(writer).not.toHaveBeenCalled()
  })
})
