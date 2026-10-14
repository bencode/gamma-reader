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
  it('follows relative series links within the project and Back returns to the article', async () => {
    const folder = 'knowledge/ai-agent-systems/rea'
    const current = `${folder}/02-CLI与MCP的启动和调用链.md`
    const destinations = [
      ['上一篇 项目定位', '01-项目定位与逆向调查模型.md'],
      ['返回系列入口', 'README.md'],
      ['下一篇 Provider 选择与目标会话', '03-Provider选择与目标会话.md'],
    ] as const
    await writeStoredTextFile(
      current,
      destinations.map(([label, name]) => `[${label}](./${name})`).join(' · '),
    )
    await writeStoredTextFile('README.md', '# Another README')
    await Promise.all(
      destinations.map(([label, name]) => writeStoredTextFile(`${folder}/${name}`, `# ${label}`)),
    )
    render(
      <MemoryRouter
        basename="/p/source-brain2"
        initialEntries={[`/p/source-brain2/files/${current}`]}
      >
        <Workbench project={testProject} />
        <Navigation />
      </MemoryRouter>,
    )
    const user = userEvent.setup({ delay: null })
    const route = screen.getByLabelText('Current route')
    for (const [label, name] of destinations) {
      const link = await screen.findByRole('link', { name: label })
      expect(link).toHaveAttribute(
        'href',
        `/p/source-brain2/files/${folder}/${encodeURIComponent(name)}`,
      )
      await user.click(link)
      await waitFor(() => expect(route).toHaveTextContent(`/files/${folder}/${name}`))
      expect(await screen.findByRole('heading', { name: label })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Back' }))
      await waitFor(() => expect(route).toHaveTextContent(`/files/${current}`))
    }
  })

  it('resolves a relative link from the embedded article directory', async () => {
    await writeStoredTextFile('Home.md', '# Home\n\n![[Chapter]]')
    await writeStoredTextFile('series/Chapter.md', '# Chapter\n\n[Series entry](./README.md)')
    await writeStoredTextFile('series/README.md', '# Series')
    await writeStoredTextFile('README.md', '# Root')
    render(
      <MemoryRouter initialEntries={['/files/Home.md']}>
        <Workbench project={testProject} />
        <Navigation />
      </MemoryRouter>,
    )
    const link = await screen.findByRole('link', { name: 'Series entry' })
    expect(link).toHaveAttribute('href', '/files/series/README.md')
    await userEvent.click(link)
    await waitFor(() =>
      expect(screen.getByLabelText('Current route')).toHaveTextContent('/files/series/README.md'),
    )
    expect(await screen.findByRole('heading', { name: 'Series' })).toBeInTheDocument()
  })

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
    await user.click(within(article()).getByRole('button', { name: 'Uses Topic here' }))
    await waitFor(() => expect(route).toHaveTextContent('/files/notes/Linker.md'))
  })

  it('opens a tag no note holds as a page of what links to it, which leads back', async () => {
    await writeStoredTextFile('notes/Tagged.md', '# Tagged\n\nAbout #[[Retrieval ideas]] today.')
    const user = userEvent.setup({ delay: null })
    render(
      <MemoryRouter initialEntries={['/files/notes%2FTagged.md']}>
        <Workbench project={testProject} />
        <Navigation />
      </MemoryRouter>,
    )

    const tag = await screen.findByRole('button', { name: '#Retrieval ideas' })
    await waitFor(() =>
      expect(tag).toHaveAttribute('title', 'No note named Retrieval ideas yet. Open its page.'),
    )
    await user.click(tag)

    const route = screen.getByLabelText('Current route')
    await waitFor(() => expect(route).toHaveTextContent('/pages/retrieval ideas'))
    expect(await screen.findByRole('tab', { name: 'Retrieval ideas' })).toBeInTheDocument()
    expect(screen.getByText('No note named Retrieval ideas yet.')).toBeInTheDocument()
    expect(screen.getByText('1 link to this note')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'About #Retrieval ideas today.' }))
    await waitFor(() => expect(route).toHaveTextContent('/files/notes/Tagged.md'))
    await user.click(screen.getByRole('button', { name: 'Close Page: Retrieval ideas' }))
    expect(screen.queryByRole('tab', { name: 'Retrieval ideas' })).not.toBeInTheDocument()
  })
})
