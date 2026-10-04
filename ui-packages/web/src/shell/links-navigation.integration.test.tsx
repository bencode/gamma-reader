import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { writeStoredTextFile } from '../data/file-store'
import { testProject } from '../test/project'
import { Workbench } from './workbench'

beforeEach(() => {
  Range.prototype.getClientRects = () => [new DOMRect(0, 0, 100, 20)] as unknown as DOMRectList
})

const Navigation = () => {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <output aria-label="Current route">{decodeURIComponent(location.pathname)}</output>
      <button type="button" onClick={() => void navigate(-1)}>
        Back
      </button>
    </>
  )
}

const article = () => screen.getByRole('tabpanel').querySelector('article') as HTMLElement

describe('following links between notes', () => {
  it('opens the linked note at the named block, and Back returns to the note before', async () => {
    await writeStoredTextFile('notes/Reading.md', '# Reading\n\nSee [[Retrieval#^first|why]].')
    await writeStoredTextFile(
      'notes/Retrieval.md',
      '# Retrieval\n\nIntro.\n\nRetrieval comes first. ^first\n\n- An item ^item',
    )
    const user = userEvent.setup({ delay: null })
    render(
      <MemoryRouter initialEntries={['/files/notes%2FReading.md']}>
        <Workbench project={testProject} />
        <Navigation />
      </MemoryRouter>,
    )

    // A link can be followed once the library is indexed and knows where it leads.
    const link = await screen.findByRole('button', { name: 'why' })
    await waitFor(() => expect(link).toHaveAttribute('title', 'notes/Retrieval.md'))
    await user.click(link)

    const route = screen.getByLabelText('Current route')
    await waitFor(() => expect(route).toHaveTextContent('/files/notes/Retrieval.md'))
    const named = await waitFor(() => {
      const element = article().querySelector('[data-block="first"]')
      expect(element).not.toBeNull()
      return element as HTMLElement
    })
    expect(named).toHaveTextContent('Retrieval comes first.')
    const body = article().querySelector('.markdown-content') as HTMLElement
    expect(within(body).queryByText(/\^first|\^item/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(route).toHaveTextContent('/files/notes/Reading.md'))
  })

  it('shows an embedded block in place, and leads back from a note to those that link to it', async () => {
    await writeStoredTextFile('notes/Hub.md', '# Hub\n\n![[Topic#^core]]')
    await writeStoredTextFile('notes/Topic.md', '# Topic\n\nCore idea. ^core\n\nMore.')
    await writeStoredTextFile('notes/Linker.md', '# Linker\n\n- Uses [[Topic]] here ^uses')
    const user = userEvent.setup({ delay: null })
    render(
      <MemoryRouter initialEntries={['/files/notes%2FHub.md']}>
        <Workbench project={testProject} />
        <Navigation />
      </MemoryRouter>,
    )

    // The embed shows the block alone, read from the saved note once the library is indexed.
    expect(await screen.findByText('Core idea.')).toBeInTheDocument()
    expect(within(article()).queryByText('More.')).not.toBeInTheDocument()

    await user.click(within(article()).getByRole('button', { name: 'Topic#^core ›' }))
    const route = screen.getByLabelText('Current route')
    await waitFor(() => expect(route).toHaveTextContent('/files/notes/Topic.md'))
    expect(await screen.findByText('2 links to this note')).toBeInTheDocument()
    await user.click(within(article()).getByRole('button', { name: 'Uses [[Topic]] here' }))
    await waitFor(() => expect(route).toHaveTextContent('/files/notes/Linker.md'))
  })
})
