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
    expect(within(article()).queryByText(/\^first|\^item/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(route).toHaveTextContent('/files/notes/Reading.md'))
  })
})
