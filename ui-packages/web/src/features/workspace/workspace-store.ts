import { customAlphabet } from 'nanoid'
import { createStore } from 'zustand/vanilla'
import type { ReadingPosition } from '../../core/reading-position'

// A draft's version is copied back by the assistant, so it is short, lower case, and leaves out
// characters that read alike (0 and o, 1 and l). Eight of them never repeat within a session.
const draftVersion = customAlphabet('23456789abcdefghijkmnpqrstuvwxyz', 8)

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

// A place in a file that a link asked to show: a named block, a heading by its key, or a PDF
// page. The file's reader shows it once and clears it.
export type RevealTarget = { block: string } | { heading: string } | { page: number }
export type Reveal = { fileId: string; target: RevealTarget }

export type WorkspaceState = {
  tabs: string[]
  sourceDrafts: Record<string, SourceDraft>
  positions: Record<string, ReadingPosition>
  reveal: Reveal | null
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
  setPosition: (fileId: string, position: ReadingPosition) => void
  reveal: (fileId: string, target: RevealTarget) => void
  clearReveal: (reveal: Reveal) => void
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

export const createWorkspaceStore = (
  tabs: string[],
  positions: Record<string, ReadingPosition> = {},
) =>
  createStore<WorkspaceState>(() => ({
    tabs,
    sourceDrafts: {},
    positions,
    reveal: null,
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
          positions: Object.fromEntries(
            Object.entries(state.positions).filter(([id]) => !closing.has(id)),
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
                version: draftVersion(),
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
                version: draftVersion(),
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
            : { ...draft, content, version: draftVersion(), saveError: null },
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
            version: draftVersion(),
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
    setPosition: (fileId, position) =>
      set(state => ({ positions: { ...state.positions, [fileId]: position } })),
    reveal: (fileId, target) => set({ reveal: { fileId, target } }),
    // Only the reveal that was shown is cleared, not a newer one asked for meanwhile.
    clearReveal: reveal => set(state => (state.reveal === reveal ? { reveal: null } : state)),
  }
}
