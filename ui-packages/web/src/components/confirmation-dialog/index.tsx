import { type ReactNode, useEffect, useRef } from 'react'

type ConfirmationDialogProps = {
  children: ReactNode
  label: string
  onCancel: () => void
  /** Extends the shared shape for a dialog that needs more room than a prompt. */
  className?: string
}

export const ConfirmationDialog = ({
  children,
  label,
  onCancel,
  className,
}: ConfirmationDialogProps) => {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className={className ? `confirmation-dialog ${className}` : 'confirmation-dialog'}
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
