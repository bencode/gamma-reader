import { describe, expect, it } from 'vitest'
import { createWorkspaceActions, createWorkspaceStore, sourceDirty } from './workspace-store'

const setup = () => {
  const store = createWorkspaceStore(['note'])
  const actions = createWorkspaceActions(store)
  actions.synchronizeSource('note', { revision: 1, content: 'original' })
  return { store, actions, draft: () => store.getState().sourceDrafts.note }
}

describe('workspace source drafts', () => {
  it('keeps newer typing when a save finishes and ignores stale saved copies', () => {
    const { actions, draft } = setup()
    actions.updateSource('note', 'submitted')
    actions.beginSourceSave('note')
    actions.updateSource('note', 'still typing')
    const editedVersion = draft()?.version
    actions.synchronizeSource('note', { revision: 2, content: 'submitted' })
    expect(draft()?.savePhase).toBe('saving')
    actions.completeSourceSave('note', { revision: 2, content: 'submitted' })
    actions.synchronizeSource('note', { revision: 1, content: 'original' })
    expect(draft()).toMatchObject({
      content: 'still typing',
      base: { revision: 2, content: 'submitted' },
      version: editedVersion,
      incoming: null,
    })
    expect(sourceDirty(draft())).toBe(true)
  })

  it('preserves versions for unchanged drafts and never reuses them after reopening', () => {
    const { actions, draft } = setup()
    const initial = draft()?.version
    expect(initial).toEqual(expect.any(String))
    actions.updateSource('note', 'original')
    actions.setSourceOpen('note', true)
    actions.synchronizeSource('note', { revision: 1, content: 'original' })
    expect(draft()?.version).toBe(initial)
    actions.forgetSource('note')
    actions.synchronizeSource('note', { revision: 1, content: 'original' })
    expect(draft()?.version).not.toBe(initial)
    actions.updateSource('note', 'edited')
    const edited = draft()?.version
    actions.synchronizeSource('note', { revision: 2, content: 'external' })
    expect(draft()?.version).toBe(edited)
    actions.reloadIncomingSource('note')
    expect(draft()?.version).not.toBe(edited)
  })

  it('adopts clean updates but preserves dirty drafts until explicitly reloaded', () => {
    const { actions, draft } = setup()
    actions.synchronizeSource('note', { revision: 2, content: 'external' })
    expect(draft()?.content).toBe('external')
    actions.updateSource('note', 'local edit')
    actions.synchronizeSource('note', { revision: 3, content: 'external edit' })
    expect(draft()).toMatchObject({ content: 'local edit', incoming: { revision: 3 } })
    actions.reloadIncomingSource('note')
    expect(draft()?.content).toBe('external edit')
    expect(sourceDirty(draft())).toBe(false)
    actions.forgetSource('note')
    actions.completeSourceSave('note', { revision: 4, content: 'late save' })
    expect(draft()).toBeUndefined()
  })
})
