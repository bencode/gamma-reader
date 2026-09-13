import { createWriteTool } from '@earendil-works/pi-agent-core'
import { describe, expect, it, vi } from 'vitest'
import {
  getStoredFileContent,
  importStoredFiles,
  listStoredFiles,
  writeStoredTextFile,
} from '../../data/file-store'
import { createWorkspaceWriteEnv } from './workspace-write-env'

const executeWrite = async (path: string, content: string, signal?: AbortSignal) => {
  const tool = createWriteTool()
  return tool.execute('write-fixture', { path, content }, signal, undefined, {
    env: createWorkspaceWriteEnv(writeStoredTextFile),
  })
}

describe('browser workspace write environment', () => {
  it('uses Pi write to create and completely replace UTF-8 text files', async () => {
    const created = await executeWrite('Study notes.md', '# 第一版')
    expect(created.content).toEqual([
      { type: 'text', text: 'Successfully wrote 5 bytes to Study notes.md' },
    ])
    const first = (await listStoredFiles()).find(file => file.name === 'Study notes.md')
    if (!first) throw new Error('Written file is missing')
    expect(first).toMatchObject({ collection: 'files', previewKind: 'markdown', revision: 1 })
    expect(first.size).toBe(new TextEncoder().encode('# 第一版').byteLength)

    await executeWrite('/workspace/study NOTES.md', '# Final')
    const second = (await listStoredFiles()).find(file => file.id === first.id)
    expect(second).toMatchObject({ name: 'study NOTES.md', revision: 2 })
    expect(await (await getStoredFileContent(first.id))?.text()).toBe('# Final')
  })

  it('supports text-based formats and preserves an overwritten attachment reference', async () => {
    await executeWrite('report.html', '<main>Report</main>')
    await executeWrite('component.tsx', 'export const Value = 1')
    const attachment = await importStoredFiles(
      [new File(['draft'], 'chat.txt', { type: 'text/plain' })],
      'keep',
      'attachments',
    )
    const attachmentId = attachment.addedIds[0]
    if (!attachmentId) throw new Error('Attachment fixture is missing')
    await executeWrite('chat.txt', 'revised')

    const files = await listStoredFiles()
    expect(files.find(file => file.name === 'report.html')?.previewKind).toBe('html')
    expect(files.find(file => file.name === 'component.tsx')?.previewKind).toBe('text')
    expect(files.find(file => file.id === attachmentId)).toMatchObject({
      collection: 'attachments',
      revision: 2,
    })
  })

  it('rejects nested and external paths, binary writes and cancelled calls', async () => {
    await expect(executeWrite('../outside.md', 'blocked')).rejects.toThrow('workspace root')
    await expect(executeWrite('folder/nested.md', 'blocked')).rejects.toThrow('workspace root')
    await expect(executeWrite('/outside.md', 'blocked')).rejects.toThrow('workspace root')

    const env = createWorkspaceWriteEnv(writeStoredTextFile)
    await expect(env.writeFile('binary.png', new Uint8Array([1]))).resolves.toMatchObject({
      ok: false,
      error: { code: 'not_supported' },
    })
    const writer = vi.fn(writeStoredTextFile)
    const controller = new AbortController()
    controller.abort()
    await expect(
      createWriteTool().execute(
        'cancelled',
        { path: 'cancelled.md', content: 'not written' },
        controller.signal,
        undefined,
        { env: createWorkspaceWriteEnv(writer) },
      ),
    ).rejects.toThrow()
    expect(writer).not.toHaveBeenCalled()
  })
})
