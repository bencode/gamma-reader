import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { samples } from '../core/samples'
import { removeStoredFiles, writeStoredTextFile } from '../data/file-store'
import { testProject } from '../test/project'
import { Workbench } from './workbench'

beforeEach(() => {
  // Code reads in CodeMirror, which measures text geometry unavailable in jsdom.
  Range.prototype.getClientRects = () => [new DOMRect(0, 0, 100, 20)] as unknown as DOMRectList
})

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
        <Workbench project={testProject} />
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
        <Workbench project={testProject} />
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

  it('skips files already in the library and removes the active browser copy', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <MemoryRouter>
        <Workbench project={testProject} />
      </MemoryRouter>,
    )
    await waitForFiles()
    const input = screen.getByLabelText('Choose files')

    await user.upload(input, new File(['one'], 'Draft.txt', { type: 'text/plain' }))
    await filesList().findByRole('button', { name: 'Draft.txt' })
    await user.upload(input, [
      new File(['two'], 'Draft.txt', { type: 'text/plain' }),
      new File(['new'], 'Fresh.txt', { type: 'text/plain' }),
    ])
    expect(screen.getByRole('dialog', { name: 'Resolve duplicate files' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Skip existing' }))
    await filesList().findByRole('button', { name: 'Fresh.txt' })
    expect(filesList().queryByRole('button', { name: 'Draft (2).txt' })).toBeNull()

    await user.click(filesList().getByRole('button', { name: 'Draft.txt' }))
    expect(await screen.findByText('one')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Remove Draft.txt from Files' }))
    expect(screen.getByRole('dialog', { name: 'Remove Draft.txt' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(filesList().queryByRole('button', { name: 'Draft.txt' })).toBeNull())
    expect(screen.queryByRole('tab', { name: 'Draft.txt' })).not.toBeInTheDocument()
    expect(screen.queryByText('Browser copy removed.')).not.toBeInTheDocument()
  })

  it('shows files on paths inside folded folders that open on request', async () => {
    const user = userEvent.setup({ delay: null })
    await writeStoredTextFile('src/core/files.ts', 'export const kind = "core"')
    await writeStoredTextFile('src/app.ts', 'export const kind = "app"')
    render(
      <MemoryRouter>
        <Workbench project={testProject} />
      </MemoryRouter>,
    )
    await waitForFiles()

    const folder = filesList().getByRole('button', { name: 'src' })
    expect(folder).toHaveAttribute('aria-expanded', 'false')
    expect(filesList().queryByRole('button', { name: 'app.ts' })).toBeNull()

    await user.click(folder)
    await user.click(filesList().getByRole('button', { name: 'core' }))
    const nested = filesList().getByRole('button', { name: 'files.ts' })
    expect(nested).toHaveAttribute('title', expect.stringContaining('src/core/files.ts'))
    await user.click(nested)
    expect(await screen.findByRole('tab', { name: 'files.ts' })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    await user.click(folder)
    expect(filesList().queryByRole('button', { name: 'files.ts' })).toBeNull()
  })

  it('adds a chosen folder, leaving out dependencies and reporting what it skipped', async () => {
    const user = userEvent.setup({ delay: null })
    // jsdom has no folder input; a browser without the folder picker offers one.
    Object.defineProperty(HTMLInputElement.prototype, 'webkitdirectory', {
      configurable: true,
      value: false,
    })
    const inFolder = (path: string, content: string) => {
      const file = new File([content], path.slice(path.lastIndexOf('/') + 1))
      Object.defineProperty(file, 'webkitRelativePath', { value: path })
      return file
    }
    try {
      render(
        <MemoryRouter>
          <Workbench project={testProject} />
        </MemoryRouter>,
      )
      await waitForFiles()
      await user.click(screen.getByRole('button', { name: 'Add files or a folder' }))
      expect(screen.getByRole('menuitem', { name: 'Add files…' })).toBeVisible()
      expect(screen.getByRole('menuitem', { name: 'Add folder…' })).toBeVisible()
      await user.keyboard('{Escape}')

      await user.upload(screen.getByLabelText('Choose a folder'), [
        inFolder('tool/main.py', 'print("hello")'),
        inFolder('tool/README', 'A small tool'),
        inFolder('tool/node_modules/lib/index.js', 'module.exports = 1'),
        inFolder('tool/.env', 'SECRET=1'),
      ])

      expect(await screen.findByRole('alert')).toHaveTextContent(
        '2 files added. Left out 2 files that were hidden, oversized or unreadable.',
      )
      await user.click(filesList().getByRole('button', { name: 'tool' }))
      expect(filesList().getByRole('button', { name: 'main.py' })).toBeVisible()
      expect(filesList().getByRole('button', { name: 'README' })).toBeVisible()
      expect(filesList().queryByRole('button', { name: 'node_modules' })).toBeNull()
    } finally {
      Reflect.deleteProperty(HTMLInputElement.prototype, 'webkitdirectory')
    }
  })

  it('reads source code highlighted by its language, without a Source view', async () => {
    await writeStoredTextFile('tools/run.py', 'def greet(name):\n    return f"hello {name}"\n')
    render(
      <MemoryRouter initialEntries={['/files/tools/run.py']}>
        <Workbench project={testProject} />
      </MemoryRouter>,
    )

    const code = await screen.findByRole('textbox', { name: 'tools/run.py code' })
    expect(code).toHaveTextContent('def greet(name):')
    expect(code).toHaveAttribute('aria-readonly', 'true')
    // Python support loads on demand; once it has, the keyword stands apart from plain text.
    await waitFor(() => expect(within(code).getByText('def').tagName).toBe('SPAN'))
    // Code is read, not edited here, so there is no Source view to open beside it.
    expect(screen.queryByRole('button', { name: 'Source' })).toBeNull()
  })

  it('removes a folder with every file in it and closes their tabs', async () => {
    const user = userEvent.setup({ delay: null })
    await writeStoredTextFile('guide/intro.md', '# Intro')
    await writeStoredTextFile('guide/parts/one.md', '# One')
    render(
      <MemoryRouter initialEntries={['/files/guide/parts/one.md']}>
        <Workbench project={testProject} />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('tab', { name: 'one.md' })).toBeInTheDocument()

    await user.click(filesList().getByRole('button', { name: 'Remove folder guide from Files' }))
    const dialog = screen.getByRole('dialog', { name: 'Remove folder guide' })
    expect(dialog).toHaveTextContent('the 2 files in guide')
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(filesList().queryByRole('button', { name: 'guide' })).toBeNull())
    expect(screen.queryByRole('tab', { name: 'one.md' })).not.toBeInTheDocument()
    expect(filesList().getByRole('button', { name: 'Start here.md' })).toBeVisible()
  })

  it('keeps the add-files action in the toolbar when the library is empty', async () => {
    await Promise.all(samples.map(file => removeStoredFiles([file.id])))
    render(
      <MemoryRouter>
        <Workbench project={testProject} />
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
          <Workbench project={testProject} />
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
          <Workbench project={testProject} />
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

  it('adds dropped files, and reads a dropped folder as Add folder does', async () => {
    render(
      <MemoryRouter>
        <Workbench project={testProject} />
      </MemoryRouter>,
    )
    await waitForFiles()
    const panel = screen.getByRole('complementary', { name: 'Files' })
    const fileEntry = (file: File) => ({
      isDirectory: false,
      isFile: true,
      name: file.name,
      file: (resolve: (file: File) => void) => resolve(file),
    })
    // A dropped folder lists its entries in batches, the last one empty.
    const folderEntry = (name: string, children: unknown[]) => ({
      isDirectory: true,
      isFile: false,
      name,
      createReader: () => {
        const batches = [children, []]
        return {
          readEntries: (resolve: (batch: unknown[]) => void) => resolve(batches.shift() ?? []),
        }
      },
    })
    const drop = (files: File[], entries: unknown[]) => {
      const dataTransfer = {
        types: ['Files'],
        files,
        items: entries.map(entry => ({ kind: 'file', webkitGetAsEntry: () => entry })),
      }
      fireEvent.dragEnter(panel, { dataTransfer })
      fireEvent.drop(panel, { dataTransfer })
    }

    const loose = new File(['# Dropped\n\nArrived by drag.'], 'Dropped.md', {
      type: 'text/markdown',
    })
    fireEvent.dragEnter(panel, { dataTransfer: { types: ['Files'] } })
    expect(screen.getByText('Drop files or folders to add them')).toBeVisible()
    drop([loose], [fileEntry(loose)])
    expect(await filesList().findByRole('button', { name: 'Dropped.md' })).toBeVisible()
    expect(screen.queryByText('Drop files or folders to add them')).not.toBeInTheDocument()

    const extra = new File(['Loose'], 'Loose.txt', { type: 'text/plain' })
    // A folder reaches the drop as a File that cannot be read; only its entry says so.
    drop(
      [new File([], 'Notes'), extra],
      [
        folderEntry('Notes', [
          fileEntry(new File(['# Idea'], 'idea.md', { type: 'text/markdown' })),
          folderEntry('node_modules', [fileEntry(new File(['x'], 'lib.js'))]),
        ]),
        fileEntry(extra),
      ],
    )

    const user = userEvent.setup({ delay: null })
    await user.click(await filesList().findByRole('button', { name: 'Notes' }))
    expect(filesList().getByRole('button', { name: 'idea.md' })).toBeVisible()
    expect(filesList().getByRole('button', { name: 'Loose.txt' })).toBeVisible()
    expect(filesList().queryByRole('button', { name: 'node_modules' })).toBeNull()
  })
})
