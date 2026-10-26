import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmationDialog } from '.'

describe('a confirmation dialog', () => {
  it('closes alone on Escape, leaving the dialog it was opened from', () => {
    const outer = vi.fn()
    const inner = vi.fn()
    render(
      <dialog open aria-label="Panel" onCancel={outer}>
        <ConfirmationDialog label="Confirm" onCancel={inner}>
          Sure?
        </ConfirmationDialog>
      </dialog>,
    )

    // What the browser fires at the top dialog when Escape is pressed.
    fireEvent(
      screen.getByRole('dialog', { name: 'Confirm' }),
      new Event('cancel', { cancelable: true }),
    )

    expect(inner).toHaveBeenCalledOnce()
    expect(outer).not.toHaveBeenCalled()
  })
})
