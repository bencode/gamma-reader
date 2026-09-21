import { nanoid } from 'nanoid'
import { createStore } from 'zustand/vanilla'

export type PersistedSource = {
  revision: number
  content: string
}

export type SourceDraft = {
  base: PersistedSource
  content: string
  version: string
  sourceOpen: boolean
  incoming: PersistedSource | null
  savePhase: 'idle' | 'saving'
  saveError: string | null
}

export type WorkspaceState = {
  tabs: string[]
  sourceDrafts: Record<string, SourceDraft>
}

export type WorkspaceActions = {
  closeDocuments: (ids: readonly string[]) => void
  setTabs: (update: (tabs: string[]) => string[]) => void
  synchronizeSource: (fileId: string, persisted: PersistedSource) => void
  setSourceOpen: (fileId: string, open: boolean) => void
  updateSource: (fileId: string, content: string) => void
  beginSourceSave: (fileId: string) => void
  completeSourceSave: (fileId: string, persisted: PersistedSource) => void
  failSourceSave: (fileId: string, message: string, open?: boolean) => void
  reloadIncomingSource: (fileId: string) => void
  forgetSource: (fileId: string) => void
}

export const sourceDirty = (draft: SourceDraft | undefined) =>
  Boolean(draft && draft.content !== draft.base.content)

const updateDraft = (
  drafts: Record<string, SourceDraft>,
  fileId: string,
  update: (draft: SourceDraft) => SourceDraft,
) => {
  const draft = drafts[fileId]
  if (!draft) return drafts
  const next = update(draft)
  return next === draft ? drafts : { ...drafts, [fileId]: next }
}

export const createWorkspaceStore = (tabs: string[]) =>
  createStore<WorkspaceState>(() => ({
    tabs,
    sourceDrafts: {},
  }))

export type WorkspaceStore = ReturnType<typeof createWorkspaceStore>

export const createWorkspaceActions = (store: WorkspaceStore): WorkspaceActions => {
  const set = store.setState
  return {
    closeDocuments: ids =>
      set(state => {
        const closing = new Set(ids)
        if (!state.tabs.some(id => closing.has(id))) return state
        return {
          tabs: state.tabs.filter(id => !closing.has(id)),
          sourceDrafts: Object.fromEntries(
            Object.entries(state.sourceDrafts).filter(([id]) => !closing.has(id)),
          ),
        }
      }),
    setTabs: update =>
      set(state => {
        const tabs = update(state.tabs)
        return tabs.length === state.tabs.length &&
          tabs.every((id, index) => id === state.tabs[index])
          ? state
          : { tabs }
      }),
    synchronizeSource: (fileId, persisted) =>
      set(state => {
        const current = state.sourceDrafts[fileId]
        if (!current)
          return {
            sourceDrafts: {
              ...state.sourceDrafts,
              [fileId]: {
                base: persisted,
                content: persisted.content,
                version: nanoid(),
                sourceOpen: false,
                incoming: null,
                savePhase: 'idle',
                saveError: null,
              },
            },
          }
        if (current.base.revision >= persisted.revision) return state
        if (!sourceDirty(current) && current.savePhase !== 'saving')
          return {
            sourceDrafts: {
              ...state.sourceDrafts,
              [fileId]: {
                ...current,
                base: persisted,
                content: persisted.content,
                version: nanoid(),
                incoming: null,
                savePhase: 'idle',
                saveError: null,
              },
            },
          }
        if (current.incoming && current.incoming.revision >= persisted.revision) return state
        return {
          sourceDrafts: {
            ...state.sourceDrafts,
            [fileId]: {
              ...current,
              incoming: persisted,
              saveError: null,
            },
          },
        }
      }),
    setSourceOpen: (fileId, open) =>
      set(state => ({
        sourceDrafts: updateDraft(state.sourceDrafts, fileId, draft =>
          draft.sourceOpen === open ? draft : { ...draft, sourceOpen: open },
        ),
      })),
    updateSource: (fileId, content) =>
      set(state => ({
        sourceDrafts: updateDraft(state.sourceDrafts, fileId, draft =>
          draft.content === content
            ? draft
            : { ...draft, content, version: nanoid(), saveError: null },
        ),
      })),
    beginSourceSave: fileId =>
      set(state => ({
        sourceDrafts: updateDraft(state.sourceDrafts, fileId, draft => ({
          ...draft,
          savePhase: 'saving',
          saveError: null,
        })),
      })),
    completeSourceSave: (fileId, persisted) =>
      set(state => ({
        sourceDrafts: updateDraft(state.sourceDrafts, fileId, draft => ({
          ...draft,
          base: persisted,
          incoming:
            draft.incoming && draft.incoming.revision > persisted.revision ? draft.incoming : null,
          savePhase: 'idle',
          saveError: null,
        })),
      })),
    failSourceSave: (fileId, message, open = false) =>
      set(state => ({
        sourceDrafts: updateDraft(state.sourceDrafts, fileId, draft => ({
          ...draft,
          sourceOpen: open || draft.sourceOpen,
          savePhase: 'idle',
          saveError: message,
        })),
      })),
    reloadIncomingSource: fileId =>
      set(state => ({
        sourceDrafts: updateDraft(state.sourceDrafts, fileId, draft => {
          if (!draft.incoming) return draft
          return {
            ...draft,
            base: draft.incoming,
            content: draft.incoming.content,
            version: nanoid(),
            incoming: null,
            savePhase: 'idle',
            saveError: null,
          }
        }),
      })),
    forgetSource: fileId =>
      set(state => {
        if (!state.sourceDrafts[fileId]) return state
        const { [fileId]: _removed, ...sourceDrafts } = state.sourceDrafts
        return { sourceDrafts }
      }),
  }
}
