import { type ReactNode, useEffect, useRef } from 'react'

type ConfirmationDialogProps = { children: ReactNode; label: string; onCancel: () => void }

export const ConfirmationDialog = ({ children, label, onCancel }: ConfirmationDialogProps) => {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className="confirmation-dialog"
      aria-label={label}
      onCancel={event => {
        event.preventDefault()
        onCancel()
      }}
    >
      {children}
    </dialog>
  )
}
