import { afterEach, describe, expect, it, vi } from 'vitest'
import { bind } from '../../core/agent/tool'
import { webSearchTool } from '../assistant/web-tools'
import { loadPlugins, withPlugins } from './load-plugins'

afterEach(() => vi.restoreAllMocks())

const base = 'https://plugins.example.com'
const search = {
  name: 'notes_search',
  description: 'Search notes',
  parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
}
const notes = { name: 'notes', title: 'Notes', icon: `${base}/notes.svg`, tools: [search] }

const serve = (manifest: unknown) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(manifest))

describe('plugins', () => {
  it('reads the manifest with the browser cookie, leaving out what does not fit the protocol', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const network = serve({
      plugins: [
        { ...notes, tools: [search, { ...search, name: 'read' }] },
        { ...notes, name: 'Bad Name' },
        { ...notes, name: 'scripts', icon: 'javascript:alert(1)' },
      ],
    })

    const plugins = await loadPlugins(base, new AbortController().signal)

    expect(network).toHaveBeenCalledWith(
      `${base}/manifest`,
      expect.objectContaining({
        credentials: 'include',
      }),
    )
    expect(plugins.map(plugin => plugin.name)).toEqual(['notes'])
    expect(plugins[0]?.tools.map(tool => tool.name)).toEqual(['notes_search'])
  })

  it('calls a tool on the plugin app and hands back its answer, or its reason when it refuses', async () => {
    serve({ plugins: [notes] })
    const [plugin] = await loadPlugins(base, new AbortController().signal)
    const tool = plugin?.tools[0]
    if (!tool) throw new Error('The tool is missing.')
    const network = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ results: ['A note'] }))
      .mockResolvedValueOnce(
        Response.json(
          { error: { message: 'Reconnect Notes in the plugin app.' } },
          { status: 401 },
        ),
      )
    const run = () => tool.execute('call', { query: 'actions' }, new AbortController().signal)

    expect((await run()).content).toEqual([
      { type: 'text', text: JSON.stringify({ results: ['A note'] }) },
    ])
    expect(network).toHaveBeenCalledWith(
      `${base}/notes/tools/notes_search`,
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ query: 'actions' }),
      }),
    )
    await expect(run()).rejects.toThrow('Reconnect Notes in the plugin app.')
  })

  it('gives a conversation the tools of the plugins it turned on that are still connected', async () => {
    serve({
      plugins: [notes, { ...notes, name: 'mail', tools: [{ ...search, name: 'mail_search' }] }],
    })
    const plugins = await loadPlugins(base, new AbortController().signal)
    const read = bind('read', 'Read', webSearchTool.parameters, () => null)
    const names = (on: readonly string[], available = plugins) =>
      withPlugins(withPlugins([read], plugins, ['notes', 'mail']), available, on).map(
        tool => tool.name,
      )

    expect(names(['notes'])).toEqual(['read', 'notes_search'])
    expect(names([])).toEqual(['read'])
    expect(names(['notes', 'mail'], plugins.slice(1))).toEqual(['read', 'mail_search'])
  })
})
