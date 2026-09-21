import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { samples } from '../core/samples'
import { removeStoredFile } from '../data/file-store'
import { Workbench } from './workbench'

const filesList = () => within(screen.getByRole('list', { name: 'Files' }))
const waitForFiles = async () => {
  const panel = await screen.findByRole('complementary', { name: 'Files' })
  return within(panel).findByRole('list', { name: 'Files' })
}

const exportDirectory = (name: string, initial: Record<string, Blob> = {}) => {
  const entries = new Map(Object.entries(initial))
  const writes: string[] = []
  class TestDirectory {
    readonly kind = 'directory' as const
    readonly name = name

    async queryPermission() {
      return 'granted' as const
    }

    async requestPermission() {
      return 'granted' as const
    }

    async getFileHandle(name: string, options?: { create?: boolean }) {
      if (!entries.has(name) && !options?.create) throw new DOMException('Missing', 'NotFoundError')
      return {
        createWritable: async () =>
          ({
            write: async (blob: Blob) => {
              entries.set(name, blob)
              writes.push(name)
            },
            close: async () => {},
            abort: async () => {},
          }) as unknown as FileSystemWritableFileStream,
      } as FileSystemFileHandle
    }
  }
  return { directory: new TestDirectory(), entries, writes }
}

describe('file library', () => {
  it('adds multiple local files and previews Markdown and sandboxed HTML', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <MemoryRouter>
        <Workbench />
      </MemoryRouter>,
    )
    await waitForFiles()

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
    expect(
      within(screen.getByRole('complementary', { name: 'Files' })).queryByRole('status'),
    ).not.toBeInTheDocument()
    await user.click(filesList().getByRole('button', { name: 'Imported.md' }))
    expect(await screen.findByRole('heading', { name: 'Imported note' })).toBeVisible()

    await user.click(filesList().getByRole('button', { name: 'Page.html' }))
    const preview = await within(screen.getByRole('tabpanel')).findByTitle('Page.html')
    expect(preview).toHaveAttribute('sandbox', 'allow-scripts')
    expect(preview).toHaveAttribute('referrerpolicy', 'no-referrer')
  })

  it('confirms dirty tab closure and saves the draft before closing', async () => {
    Range.prototype.getClientRects = () => [new DOMRect(0, 0, 100, 20)] as unknown as DOMRectList
    const user = userEvent.setup({ delay: null })
    render(
      <MemoryRouter>
        <Workbench />
      </MemoryRouter>,
    )
    await waitForFiles()
    await user.upload(
      screen.getByLabelText('Choose files'),
      new File(['# Close test'], 'Close.md', { type: 'text/markdown' }),
    )
    await user.click(await filesList().findByRole('button', { name: 'Close.md' }))
    await user.click(await screen.findByRole('button', { name: 'Source' }))
    const editor = await screen.findByRole('textbox', { name: 'Close.md source' })
    await user.click(editor)
    await user.keyboard('changed')
    await user.click(screen.getByRole('button', { name: 'Close Close.md' }))
    expect(await screen.findByRole('dialog', { name: 'Save changes to Close.md' })).toBeVisible()
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('textbox', { name: 'Close.md source' })).toHaveTextContent('changed')
    await user.click(screen.getByRole('button', { name: 'Remove Close.md from Files' }))
    expect(await screen.findByRole('dialog', { name: 'Remove Close.md' })).toHaveTextContent(
      'Unsaved source changes',
    )
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Close Close.md' }))
    await user.click(await screen.findByRole('button', { name: 'Save and close' }))
    await waitFor(() =>
      expect(screen.queryByRole('tab', { name: /Close.md/ })).not.toBeInTheDocument(),
    )
    await screen.findByRole('heading', { name: 'Start with a document' })
    await user.click(filesList().getByRole('button', { name: 'Close.md' }))
    await waitFor(() => expect(screen.getByRole('tabpanel')).toHaveTextContent('changed'))
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('resolves duplicate names and removes the active browser copy', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <MemoryRouter>
        <Workbench />
      </MemoryRouter>,
    )
    await waitForFiles()
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

  it('confirms new name conflicts before saving Files to a remembered folder', async () => {
    const user = userEvent.setup({ delay: null })
    const existing = new Blob(['external'])
    const target = exportDirectory('Reading exports', { 'Start here.md': existing })
    const anotherTarget = exportDirectory('Other exports')
    const picker = vi
      .fn()
      .mockResolvedValueOnce(target.directory)
      .mockResolvedValueOnce(anotherTarget.directory)
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: picker,
    })
    try {
      render(
        <MemoryRouter>
          <Workbench />
        </MemoryRouter>,
      )
      await waitForFiles()
      await user.click(screen.getByRole('button', { name: 'Save files to folder' }))

      expect(await screen.findByRole('dialog', { name: 'Replace existing files' })).toBeVisible()
      expect(target.writes).toEqual([])
      await user.click(await screen.findByRole('button', { name: 'Replace files' }))
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Save files to Reading exports' })).toBeEnabled(),
      )

      expect(target.entries.size).toBe(samples.length)
      expect(target.writes).toHaveLength(samples.length)
      expect(await target.entries.get('Start here.md')?.text()).not.toBe('external')

      await user.upload(
        screen.getByLabelText('Choose files'),
        new File(['new'], 'New notes.md', { type: 'text/markdown' }),
      )
      await screen.findByRole('button', { name: 'New notes.md' })
      const saveChanges = screen.getByRole('button', { name: 'Save changes to Reading exports' })
      expect(saveChanges).toBeEnabled()
      await user.click(saveChanges)
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Save files to Reading exports' })).toBeEnabled(),
      )

      await user.click(screen.getByRole('button', { name: 'Remove New notes.md from Files' }))
      await user.click(screen.getByRole('button', { name: 'Remove' }))
      await waitFor(() =>
        expect(filesList().queryByRole('button', { name: 'New notes.md' })).toBeNull(),
      )
      expect(target.entries.has('New notes.md')).toBe(true)
      expect(screen.getByRole('button', { name: 'Save files to Reading exports' })).toBeEnabled()

      await user.click(screen.getByRole('button', { name: 'Folder save options' }))
      await user.click(screen.getByRole('menuitem', { name: 'Choose another folder…' }))
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Save files to Other exports' })).toBeEnabled(),
      )
      expect(anotherTarget.writes).toHaveLength(samples.length)

      for (const sample of samples) {
        await user.click(screen.getByRole('button', { name: `Remove ${sample.name} from Files` }))
        await user.click(screen.getByRole('button', { name: 'Remove' }))
        await waitFor(() =>
          expect(
            screen.queryByRole('button', { name: `Remove ${sample.name} from Files` }),
          ).toBeNull(),
        )
      }
      expect(screen.getByRole('button', { name: 'Folder save options' })).toBeDisabled()
    } finally {
      Reflect.deleteProperty(window, 'showDirectoryPicker')
    }
  })

  it('saves one file without opening it in the reader', async () => {
    const user = userEvent.setup({ delay: null })
    const writes: Blob[] = []
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: vi.fn(async () => ({
        createWritable: async () =>
          ({
            write: async (blob: Blob) => writes.push(blob),
            close: async () => {},
            abort: async () => {},
          }) as unknown as FileSystemWritableFileStream,
      })),
    })
    try {
      render(
        <MemoryRouter>
          <Workbench />
        </MemoryRouter>,
      )
      await waitForFiles()
      await user.click(screen.getByRole('button', { name: 'Save Explore a wave.lab.md as' }))
      await waitFor(() => expect(writes).toHaveLength(1))

      expect(screen.queryByRole('tab', { name: 'Explore a wave.lab.md' })).not.toBeInTheDocument()
    } finally {
      Reflect.deleteProperty(window, 'showSaveFilePicker')
    }
  })

  it('adds files dropped onto the panel and leaves a dropped folder alone', async () => {
    render(
      <MemoryRouter>
        <Workbench />
      </MemoryRouter>,
    )
    await waitForFiles()
    const panel = screen.getByRole('complementary', { name: 'Files' })

    const note = new File(['# Dropped\n\nArrived by drag.'], 'Dropped.md', {
      type: 'text/markdown',
    })
    // A folder reaches the drop as a File that cannot be read; only its entry says so.
    const folder = new File([], 'Notes')
    const dataTransfer = {
      types: ['Files'],
      files: [note, folder],
      items: [
        { webkitGetAsEntry: () => ({ isDirectory: false, name: note.name }) },
        { webkitGetAsEntry: () => ({ isDirectory: true, name: folder.name }) },
      ],
    }

    fireEvent.dragEnter(panel, { dataTransfer })
    expect(screen.getByText('Drop files to add them')).toBeVisible()
    fireEvent.drop(panel, { dataTransfer })

    expect(await filesList().findByRole('button', { name: 'Dropped.md' })).toBeVisible()
    expect(filesList().queryByRole('button', { name: 'Notes' })).not.toBeInTheDocument()
    expect(screen.queryByText('Drop files to add them')).not.toBeInTheDocument()
  })
})
