import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveUserProvider } from '../core/models/byok/store'
import { modelConfig as config } from '../test/model-config'
import { testProject } from '../test/project'
import { Workbench } from './workbench'

const event = (delta: unknown, finish: string | null = null) =>
  `data: ${JSON.stringify({ id: 'answer', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`
const reply = (text: string) =>
  new Response(
    `${event({ role: 'assistant', content: text })}${event({}, 'stop')}data: [DONE]\n\n`,
    {
      headers: { 'Content-Type': 'text/event-stream' },
    },
  )

const open = () =>
  render(
    <MemoryRouter initialEntries={['/files/getting-started']}>
      <Workbench project={testProject} />
    </MemoryRouter>,
  )

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('a reader who brought their own key', () => {
  it('sends to the vendor with that key and never through our proxy', async () => {
    const user = userEvent.setup({ delay: null })
    const sent: { url: string; authorization: unknown }[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const address = String(url)
      if (address === '/api/agent/config') return Response.json(config)
      // The catalogue request the dialog makes to check the key.
      if (address.endsWith('/models')) return Response.json({ data: [{ id: 'deepseek-v4-pro' }] })
      sent.push({
        url: address,
        authorization: new Headers(init?.headers).get('authorization'),
      })
      return reply('An answer')
    })

    open()
    const models = await screen.findByRole('combobox', { name: 'Chat model' })
    await user.selectOptions(models, 'Add your own model…')

    const dialog = await screen.findByRole('dialog', { name: 'Model providers' })
    const inside = within(dialog)
    await user.selectOptions(inside.getByLabelText('Provider'), 'deepseek')
    await user.type(inside.getByLabelText('API key'), 'sk-the-readers-own')
    await user.click(inside.getByRole('button', { name: 'Check key' }))
    await user.click(await inside.findByRole('button', { name: 'Save' }))
    await user.click(inside.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(dialog).not.toBeInTheDocument())

    // The same vendor now appears twice, which is why each is registered apart.
    const own = await screen.findByRole('group', { name: 'DeepSeek (your key)' })
    expect(screen.getByRole('group', { name: 'DeepSeek (free)' })).toBeInTheDocument()
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Chat model' }),
      within(own).getByRole('option', { name: 'DeepSeek V4 Pro' }),
    )
    await user.type(screen.getByRole('textbox', { name: 'Your question' }), 'Who pays for this?')
    await user.click(screen.getByRole('button', { name: 'Send question' }))

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]?.url).toContain('https://api.deepseek.com')
    expect(sent[0]?.authorization).toBe('Bearer sk-the-readers-own')
    // The promise this whole approach rests on.
    expect(sent.every(request => !request.url.includes('/api/agent/'))).toBe(true)
  })

  it('says when the model a conversation runs on with that key is gone', async () => {
    const user = userEvent.setup({ delay: null })
    saveUserProvider({ id: 'deepseek', apiKey: 'sk-the-readers-own', models: ['deepseek-v4-pro'] })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async url =>
      String(url) === '/api/agent/config' ? Response.json(config) : reply('An answer'),
    )

    open()
    const own = await screen.findByRole('group', { name: 'DeepSeek (your key)' })
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Chat model' }),
      within(own).getByRole('option', { name: 'DeepSeek V4 Pro' }),
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Chat model' }),
      'Add your own model…',
    )
    const dialog = await screen.findByRole('dialog', { name: 'Model providers' })
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Remove DeepSeek' })).getByRole('button', {
        name: 'Remove',
      }),
    )
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))

    // The next message would go through our server, so this is said before it is sent.
    const notice = await screen.findByRole('alert')
    expect(notice.textContent).toContain('deepseek-v4-pro (your key) is no longer set up')
    expect(notice.textContent).toContain('(free)')

    const models = screen.getByRole('combobox', { name: 'Chat model' })
    const other = within(models)
      .getAllByRole('option')
      .find(
        option =>
          !(option as HTMLOptionElement).selected && option.textContent !== 'Add your own model…',
      )
    if (!other) throw new Error('no other model to choose')
    await user.selectOptions(models, other)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
