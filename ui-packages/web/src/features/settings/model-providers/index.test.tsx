import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { customProviderKey } from '../../../core/models/byok/catalog'
import { saveUserProvider, userProviders } from '../../../core/models/byok/store'
import { ModelProviderDialog } from '.'

describe('the model providers dialog', () => {
  it('asks before removing a provider, since its key cannot be had back from here', async () => {
    const user = userEvent.setup({ delay: null })
    saveUserProvider({
      id: customProviderKey('Company relay'),
      apiKey: 'sk-relay',
      models: ['relay-chat'],
      baseUrl: 'https://relay.example/v1',
      label: 'Company relay',
    })
    render(<ModelProviderDialog onClose={vi.fn()} />)
    const row = screen.getByText('Company relay').closest('li')
    if (!row) throw new Error('Provider row is missing')

    await user.click(within(row).getByRole('button', { name: 'Remove' }))
    const confirm = screen.getByRole('dialog', { name: 'Remove Company relay' })
    expect(confirm.textContent).toContain('key, address and models')
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(confirm).not.toBeInTheDocument()
    expect(userProviders()).toHaveLength(1)

    await user.click(within(row).getByRole('button', { name: 'Remove' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Remove Company relay' })).getByRole('button', {
        name: 'Remove',
      }),
    )
    expect(userProviders()).toHaveLength(0)
    expect(screen.queryByText('Company relay')).not.toBeInTheDocument()
  })
})
