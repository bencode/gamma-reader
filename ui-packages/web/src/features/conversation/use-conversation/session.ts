import type { AgentState } from '@earendil-works/pi-agent-core'
import type { PublicModelConfig } from '@gamma-reader/shared/model-config'
import { nanoid } from 'nanoid'
import {
  emptyConversationDraft,
  type ModelSelection,
  type StoredConversation,
} from '../../../core/conversations'
import type { ModelRuntime } from '../../../core/models/model-runtime'
import { workspaceStorageBases, workspaceStorageKey } from '../../../data/workspace-database'

export type ConversationPhase =
  | 'loading'
  | 'connecting'
  | 'ready'
  | 'unavailable'
  | 'error'
  | 'running'
  | 'stopping'
  | 'compacting'
  | 'switching'
export type ConversationView = 'chat' | 'history'

export type ConfigState =
  | { kind: 'loading' }
  | {
      kind: 'enabled'
      runtime: ModelRuntime
      config: Extract<PublicModelConfig, { enabled: true }>
    }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string }

export const webSearchAvailable = (state: ConfigState) =>
  state.kind === 'enabled' && state.config.webSearch === true

export const activeConversationKey = () =>
  workspaceStorageKey(workspaceStorageBases.activeConversation)

export const createConversation = (): StoredConversation => {
  const now = Date.now()
  return {
    id: nanoid(),
    title: null,
    draft: emptyConversationDraft(),
    createdAt: now,
    lastActiveAt: now,
  }
}

export const nextActivityTime = (conversation: StoredConversation) =>
  Math.max(Date.now(), conversation.lastActiveAt + 1)

export const selectionFromState = ({
  model,
  thinkingLevel,
}: Pick<AgentState, 'model' | 'thinkingLevel'>): ModelSelection => ({
  provider: model.provider,
  modelId: model.id,
  effort: thinkingLevel,
})
