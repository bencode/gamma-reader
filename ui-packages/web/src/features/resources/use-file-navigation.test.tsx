import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { StoredFileMetadata } from '../../core/files'
import { legacyDatabaseName } from '../../core/projects'
import { setWorkspaceDatabaseName } from '../../data/workspace-database'
import { readFileNavigation, writeFileNavigation } from './file-navigation'
import { useFileNavigation } from './use-file-navigation'

const file = (id: string): StoredFileMetadata => ({
  id,
  path: `${id}.md`,
  mediaType: 'text/markdown',
  previewKind: 'markdown',
  size: 1,
  createdAt: 0,
  lastModified: 0,
  revision: 1,
})

describe('project file navigation', () => {
  it('keeps the last 50 distinct activations and leaves metadata refreshes out', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000)
    const files = Array.from({ length: 51 }, (_, index) => file(String(index)))
    const { result, rerender } = renderHook(
      ({ files, activeId }) => useFileNavigation(files, true, activeId),
      { initialProps: { files, activeId: null as string | null } },
    )
    files.forEach(item => {
      rerender({ files, activeId: item.id })
    })
    expect(result.current.recent).toHaveLength(50)
    expect(result.current.recent[0]?.fileId).toBe('50')
    expect(result.current.recent.some(item => item.fileId === '0')).toBe(false)
    rerender({ files, activeId: '1' })
    expect(result.current.recent).toHaveLength(50)
    expect(result.current.recent[0]?.fileId).toBe('1')
    const visits = result.current.recent
    clock.mockReturnValue(2000)
    rerender({ files: files.map(item => ({ ...item, revision: 2 })), activeId: '1' })
    expect(result.current.recent).toEqual(visits)
    rerender({ files, activeId: null })
    rerender({ files, activeId: '50' })
    expect(result.current.recent[0]?.fileId).toBe('50')
  })

  it('preserves records until a successful library load, then removes missing IDs', () => {
    writeFileNavigation({
      view: 'starred',
      recent: [{ fileId: 'a', openedAt: 1 }],
      starred: ['a', 'b'],
    })
    const { result, rerender } = renderHook(
      ({ files, ready }) => useFileNavigation(files, ready, null),
      { initialProps: { files: [] as StoredFileMetadata[], ready: false } },
    )
    expect(result.current.starred).toEqual(['a', 'b'])
    rerender({ files: [{ ...file('a'), path: 'renamed/a.md' }, file('b')], ready: true })
    expect(result.current.recent).toEqual([{ fileId: 'a', openedAt: 1 }])
    rerender({ files: [], ready: false })
    expect(result.current.starred).toEqual(['a', 'b'])
    rerender({ files: [file('b')], ready: true })
    expect(result.current.recent).toEqual([])
    expect(result.current.starred).toEqual(['b'])
  })

  it('persists view and star order independently for each project', () => {
    const { result, unmount } = renderHook(() =>
      useFileNavigation([file('a'), file('b')], true, 'a'),
    )
    act(() => {
      result.current.toggleStar('a')
      result.current.toggleStar('b')
      result.current.setView('starred')
    })
    expect(result.current.starred).toEqual(['b', 'a'])
    act(() => result.current.toggleStar('b'))
    expect(result.current.starred).toEqual(['a'])
    expect(result.current.recent[0]?.fileId).toBe('a')
    const saved = readFileNavigation()
    unmount()
    setWorkspaceDatabaseName('another-project')
    expect(readFileNavigation()).toEqual({ view: 'files', recent: [], starred: [] })
    writeFileNavigation({ view: 'recent', recent: [], starred: [] })
    setWorkspaceDatabaseName(legacyDatabaseName)
    expect(readFileNavigation()).toEqual(saved)
  })

  it('keeps valid stored fields and reports invalid data or unavailable storage', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.setItem(
      'gamma-reader.file-navigation',
      JSON.stringify({
        view: 'unknown',
        recent: [
          { fileId: 'a', openedAt: 5 },
          { fileId: 'bad', openedAt: -1 },
          { fileId: 'invalid-date', openedAt: Number.MAX_VALUE },
        ],
        starred: ['a', 'a', null],
      }),
    )
    expect(readFileNavigation()).toEqual({
      view: 'files',
      recent: [{ fileId: 'a', openedAt: 5 }],
      starred: ['a'],
    })
    expect(error).toHaveBeenCalled()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError')
    })
    const { result } = renderHook(() => useFileNavigation([file('a')], true, null))
    act(() => result.current.setView('recent'))
    expect(result.current.view).toBe('recent')
    expect(error).toHaveBeenCalledWith('Unable to save file navigation', expect.any(DOMException))
  })
})
