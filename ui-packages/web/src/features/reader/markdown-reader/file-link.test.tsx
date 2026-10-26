import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Markdown } from '../../../components/markdown'
import type { StoredFileMetadata } from '../../../core/files'
import { EmbedScopeContext } from './embed-context'
import { FileLink } from './file-link'

const openFile = vi.hoisted(() => vi.fn())
vi.mock('../../workspace/workspace-context', () => ({ useOpenFile: () => openFile }))

const file = (
  path: string,
  collection: StoredFileMetadata['collection'] = 'files',
): StoredFileMetadata => ({
  id: path,
  path,
  collection,
  mediaType: 'text/markdown',
  previewKind: 'markdown',
  size: 1,
  lastModified: 1,
  createdAt: 1,
  revision: 1,
})

const files = [
  file('series/rea/01-项目定位.md'),
  file('series/README.md'),
  file('README.md'),
  file('01-项目定位.md'),
  file('series/rea/private.md', 'attachments'),
]
const components = { a: FileLink }

const show = (text: string) =>
  render(
    <MemoryRouter basename="/p/source-brain2" initialEntries={['/p/source-brain2/files']}>
      <EmbedScopeContext.Provider
        value={{ basePath: 'series/rea/02-CLI与MCP.md', files, components, chain: [], depth: 0 }}
      >
        <Markdown variant="reader" text={text} components={components} />
      </EmbedScopeContext.Provider>
    </MemoryRouter>,
  )

beforeEach(() => openFile.mockReset())

describe('Markdown file links', () => {
  it.each([
    ['./01-项目定位.md', 'series/rea/01-项目定位.md'],
    ['01-%E9%A1%B9%E7%9B%AE%E5%AE%9A%E4%BD%8D.md', 'series/rea/01-项目定位.md'],
    ['./01-项目定位.MD?raw#section', 'series/rea/01-项目定位.md'],
    ['../README.md', 'series/README.md'],
    ['/README.md', 'README.md'],
  ])('opens %s by its full path', async (reference, path) => {
    show(`[Read](${reference})`)
    const link = screen.getByRole('link', { name: 'Read' })
    expect(link).toHaveAttribute(
      'href',
      `/p/source-brain2/files/${path.split('/').map(encodeURIComponent).join('/')}`,
    )
    await userEvent.click(link)
    expect(openFile).toHaveBeenCalledWith(path, null)
  })

  it.each([
    ['./private.md', 'File not found in this project: series/rea/private.md'],
    ['./missing.md', 'File not found in this project: series/rea/missing.md'],
    ['../../../README.md', 'Invalid file link: ../../../README.md'],
    ['./bad%2.md', 'File not found in this project: series/rea/bad%2.md'],
    ['./bad%5Cname.md', 'Invalid file link: ./bad%5Cname.md'],
    ['./bad%00name.md', 'Invalid file link: ./bad%00name.md'],
  ])('leaves %s inactive with an explanation', async (reference, title) => {
    show(`[Read](${reference})`)
    const text = screen.getByText('Read')
    expect(text).not.toHaveAttribute('href')
    expect(text).toHaveAttribute('aria-disabled', 'true')
    expect(text).toHaveAttribute('title', title)
    await userEvent.click(text)
    expect(openFile).not.toHaveBeenCalled()
  })

  it('preserves external links, pure anchors and unsafe-address filtering', async () => {
    show('[External](https://example.test) [Here](#section) [Unsafe](javascript:alert%281%29)')
    const external = screen.getByRole('link', { name: 'External' })
    expect(external).toHaveAttribute('href', 'https://example.test')
    expect(external).toHaveAttribute('target', '_blank')
    expect(external).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByRole('link', { name: 'Here' })).toHaveAttribute('href', '#section')
    const unsafe = screen.getByText('Unsafe')
    expect(unsafe).not.toHaveAttribute('href')
    await userEvent.click(unsafe)
    expect(openFile).not.toHaveBeenCalled()
  })

  it('keeps modified clicks native and handles ordinary clicks through the workspace', () => {
    show('[Read](./01-项目定位.md)')
    const link = screen.getByRole('link', { name: 'Read' })
    expect(fireEvent.click(link, { ctrlKey: true })).toBe(true)
    expect(fireEvent.click(link, { metaKey: true })).toBe(true)
    expect(openFile).not.toHaveBeenCalled()
    expect(fireEvent.click(link)).toBe(false)
    expect(openFile).toHaveBeenCalledWith('series/rea/01-项目定位.md', null)
  })

  it('links a footnote back to the reference that cites it', () => {
    const { container } = show('Claim[^1].\n\n[^1]: Note.')
    const back = screen.getByRole('link', { name: 'Back to reference 1' })
    const target = container.querySelector(`[id="${back.getAttribute('href')?.slice(1)}"]`)
    expect(target).toBe(screen.getByRole('link', { name: '1' }))
  })
})
