import { describe, expect, it } from 'vitest'
import { importStoredFiles, listStoredFiles } from '../../data/file-store'
import { withLibraryImages } from './html-images'

describe('withLibraryImages', () => {
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

    const shown = await withLibraryImages(
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
    expect(await withLibraryImages(untouched, 'page/page.html', files)).toBe(untouched)
  })
})
