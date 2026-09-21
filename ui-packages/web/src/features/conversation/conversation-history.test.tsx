import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { emptyConversationDraft, type StoredConversation } from '../../core/conversations'
import { ConversationHistory } from './conversation-history'

const item = (id: string, title: string): StoredConversation => ({
  id,
  title,
  draft: emptyConversationDraft(),
  createdAt: 1,
  lastActiveAt: 1,
})

describe('conversation history', () => {
  it('selects, loads, and confirms deletion inside the history panel', async () => {
    const user = userEvent.setup({ delay: null })
    const onSelect = vi.fn()
    const onLoadMore = vi.fn()
    const onDelete = vi.fn().mockResolvedValue(undefined)
    render(
      <ConversationHistory
        items={[item('a', 'First question'), item('b', 'Second question')]}
        activeId="a"
        loading={false}
        error={null}
        hasMore
        switching={false}
        onBack={vi.fn()}
        onNew={vi.fn()}
        onSelect={onSelect}
        onLoadMore={onLoadMore}
        onDelete={onDelete}
      />,
    )

    await user.click(screen.getByText('Second question'))
    expect(onSelect).toHaveBeenCalledWith('b')
    await user.click(screen.getByRole('button', { name: 'Show 30 more' }))
    expect(onLoadMore).toHaveBeenCalled()

    const first = screen.getByText('First question').closest('li')
    if (!first) throw new Error('History row is missing')
    await user.click(within(first).getByRole('button', { name: 'More actions for First question' }))
    expect(within(first).getByText('Delete this conversation?')).toBeVisible()
    await user.click(within(first).getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledWith('a')
  })
})
