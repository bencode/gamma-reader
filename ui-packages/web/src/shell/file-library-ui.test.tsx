import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { samples } from '../core/samples'
import { removeStoredFile } from '../data/file-store'
import { Workbench } from './workbench'

const filesList = () => within(screen.getByRole('list', { name: 'Files' }))

describe('file library', () => {
  it('adds multiple local files and previews Markdown and sandboxed HTML', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Workbench />
      </MemoryRouter>,
    )
    await screen.findByRole('tab', { name: 'Getting started.md' })

    await user.upload(screen.getByLabelText('Choose files'), [
      new File(['# Imported note\n\nStored in this browser.'], 'Imported.md', {
        type: 'text/markdown',
      }),
      new File(
        ['<h1>Local page</h1><script>document.body.dataset.ready="true"</script>'],
        'Page.html',
        {
          type: 'text/html',
        },
      ),
    ])

    await filesList().findByRole('button', { name: 'Imported.md' })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await user.click(filesList().getByRole('button', { name: 'Imported.md' }))
    expect(await screen.findByRole('heading', { name: 'Imported note' })).toBeVisible()

    await user.click(filesList().getByRole('button', { name: 'Page.html' }))
    const preview = await within(screen.getByRole('tabpanel')).findByTitle('Page.html')
    expect(preview).toHaveAttribute('sandbox', 'allow-scripts')
    expect(preview).toHaveAttribute('referrerpolicy', 'no-referrer')
  })

  it('resolves duplicate names and removes the active browser copy', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Workbench />
      </MemoryRouter>,
    )
    await screen.findByRole('tab', { name: 'Getting started.md' })
    const input = screen.getByLabelText('Choose files')

    await user.upload(input, new File(['one'], 'Draft.txt', { type: 'text/plain' }))
    await filesList().findByRole('button', { name: 'Draft.txt' })
    await user.upload(input, new File(['two'], 'Draft.txt', { type: 'text/plain' }))
    expect(screen.getByRole('dialog', { name: 'Resolve duplicate files' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Keep both' }))
    await screen.findByText('Draft (2).txt')

    await user.click(filesList().getByRole('button', { name: 'Draft.txt' }))
    expect(await screen.findByText('one')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Remove Draft.txt from Files' }))
    expect(screen.getByRole('dialog', { name: 'Remove Draft.txt' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(filesList().queryByRole('button', { name: 'Draft.txt' })).toBeNull())
    expect(screen.queryByRole('tab', { name: 'Draft.txt' })).not.toBeInTheDocument()
    expect(screen.queryByText('Browser copy removed.')).not.toBeInTheDocument()
  })

  it('keeps the add-files action in the toolbar when the library is empty', async () => {
    await Promise.all(samples.map(file => removeStoredFile(file.id)))
    render(
      <MemoryRouter>
        <Workbench />
      </MemoryRouter>,
    )

    await screen.findByText('Add a document when you are ready to read.')
    const addFiles = screen.getByRole('button', { name: 'Add files' })
    expect(addFiles).toBeEnabled()
    expect(addFiles).toHaveAttribute('title', 'Add files')
  })
})
