import { describe, expect, it } from 'vitest'
import { resolveImportUrl } from './url-import'

describe('import addresses', () => {
  it('reads arXiv abstract and PDF pages as the paper PDF', () => {
    for (const address of [
      'https://arxiv.org/abs/1706.03762',
      'https://arxiv.org/pdf/1706.03762',
      ' https://www.arxiv.org/pdf/1706.03762.pdf ',
    ])
      expect(resolveImportUrl(address)).toEqual({
        kind: 'file',
        url: 'https://arxiv.org/pdf/1706.03762',
        name: '1706.03762.pdf',
      })
    expect(resolveImportUrl('https://arxiv.org/abs/hep-th/9901001v2')).toEqual({
      kind: 'file',
      url: 'https://arxiv.org/pdf/hep-th/9901001v2',
      name: 'hep-th_9901001v2.pdf',
    })
  })

  it('reads GitHub repositories and folders by listing and files from raw content', () => {
    const repository = { kind: 'repository', owner: 'sicp', repo: 'book', name: 'book' }
    expect(resolveImportUrl('https://github.com/sicp/book.git')).toEqual({
      ...repository,
      ref: 'HEAD',
      subpath: '',
    })
    expect(resolveImportUrl('https://github.com/sicp/book/tree/main/src/chapter%201')).toEqual({
      ...repository,
      ref: 'main',
      subpath: 'src/chapter 1',
    })
    const file = {
      kind: 'file',
      url: 'https://raw.githubusercontent.com/sicp/book/main/src/eval.scm',
      name: 'eval.scm',
    }
    expect(resolveImportUrl('https://github.com/sicp/book/blob/main/src/eval.scm')).toEqual(file)
    expect(resolveImportUrl(file.url)).toEqual(file)
  })

  it('downloads any other secure address as it is', () => {
    expect(resolveImportUrl('https://example.org/papers/notes%20v2.pdf')).toEqual({
      kind: 'file',
      url: 'https://example.org/papers/notes%20v2.pdf',
      name: 'notes v2.pdf',
    })
    expect(resolveImportUrl('https://doi.example.org/')).toEqual({
      kind: 'file',
      url: 'https://doi.example.org/',
      name: 'doi.example.org',
    })
  })

  it('recognizes no other address', () => {
    for (const address of [
      'arxiv.org/abs/1706.03762',
      'http://example.org/paper.pdf',
      'https://github.com/sicp',
      'https://github.com/sicp/book/issues/1',
      'https://github.com/sicp/book/tree/main/%E0',
      'ftp://arxiv.org/pdf/1706.03762',
    ])
      expect(resolveImportUrl(address)).toBeNull()
  })
})
