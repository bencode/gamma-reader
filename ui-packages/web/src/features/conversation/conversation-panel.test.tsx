import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ConversationPanel } from './conversation-panel'

// The panel reads the conversation through its context; this test pins the no-model
// state directly rather than driving the workbench that provides a real one.
const conversation = vi.hoisted(() => ({
  active: { id: 'a1b2c3d4', title: null, queued: [] },
  draft: '',
  setDraft: vi.fn(),
  messages: [],
  // The phase a deployment without a single model — server or own — opens in.
  phase: 'unavailable',
  error: undefined,
  storageError: undefined,
  dismissStorageError: vi.fn(),
  view: 'chat',
  showChat: vi.fn(),
  showHistory: vi.fn(),
  historyItems: [],
  activity: {},
  historyLoading: false,
  historyError: undefined,
  historyHasMore: false,
  reloadHistory: vi.fn(),
  loadMore: vi.fn(),
  switchTo: vi.fn(),
  startNew: vi.fn(),
  deleteConversation: vi.fn(),
  renameConversation: vi.fn(),
  send: vi.fn(),
  stop: vi.fn(),
  compact: vi.fn(),
  queued: [],
  removeQueued: vi.fn(),
  draftAttachments: {
    attachments: [],
    limitReached: false,
    unsettled: false,
    add: vi.fn(),
    retry: vi.fn(),
    remove: vi.fn(),
  },
  tokenUsage: null,
  modelConfiguration: null,
  selectModel: vi.fn(),
  selectEffort: vi.fn(),
  refreshProviders: vi.fn().mockResolvedValue(undefined),
  webSearch: null,
  plugins: [],
  setPlugin: vi.fn(),
}))

vi.mock('./conversation-context', () => ({ useReaderConversation: () => conversation }))

const panel = () =>
  render(
    <ConversationPanel
      inputRef={createRef()}
      onClose={vi.fn()}
      onOpenFile={vi.fn()}
      availableFileIds={new Set()}
      files={[]}
      recentFileIds={[]}
    />,
  )

describe('conversation panel without a model', () => {
  it('names the unconfigured-model state and opens model configuration from the composer area', async () => {
    const user = userEvent.setup({ delay: null })
    panel()

    expect(
      screen.getByText('No chat model is configured. Add your own key to chat.'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add a model to chat' }))
    expect(await screen.findByRole('dialog', { name: 'Model providers' })).toBeInTheDocument()
  })
})
