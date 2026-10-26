import { describe, expect, it } from 'vitest'
import { importStoredFiles, listStoredFiles } from '../../data/file-store'
import { framePage } from './html-page'

describe('framePage', () => {
  it('hands a page the library images it names, and leaves other pages as written', async () => {
    await importStoredFiles(
      [
        {
          path: 'page/images/fig.gif',
          file: new File(['GIF89a'], 'fig.gif', { type: 'image/gif' }),
        },
      ],
      'replace',
    )
    const files = await listStoredFiles()

    const shown = await framePage(
      '<img src="images/fig.gif"><img src="https://cdn.example/logo.png">',
      'page/page.html',
      files,
    )
    const untouched = '<p>No library images here <img src="elsewhere.gif">'

    expect(
      [...new DOMParser().parseFromString(shown, 'text/html').images].map(image =>
        image.getAttribute('src'),
      ),
    ).toEqual([`data:image/gif;base64,${btoa('GIF89a')}`, 'https://cdn.example/logo.png'])
    expect(await framePage(untouched, 'page/page.html', files)).toBe(untouched)
  })

  it('opens a link to the web in a new tab, and leaves a link within the page in the frame', async () => {
    const shown = await framePage(
      '<a href="https://example.com/paper">Paper</a><a href="#method">Method</a>',
      'page/page.html',
      [],
    )

    expect(
      [...new DOMParser().parseFromString(shown, 'text/html').links].map(link => [
        link.getAttribute('href'),
        link.getAttribute('target'),
      ]),
    ).toEqual([
      ['https://example.com/paper', '_blank'],
      ['#method', null],
    ])
  })
})
