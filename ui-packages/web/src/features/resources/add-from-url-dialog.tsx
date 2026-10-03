import { useEffect, useRef, useState } from 'react'
import { ConfirmationDialog as Modal } from '../../components/confirmation-dialog'
import { type ImportTarget, resolveImportUrl } from '../../core/url-import'

export const AddFromUrlDialog = ({
  onAdd,
  onCancel,
}: {
  onAdd: (target: ImportTarget) => void
  onCancel: () => void
}) => {
  const [text, setText] = useState('')
  const [invalid, setInvalid] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => inputRef.current?.focus(), [])
  return (
    <Modal label="Add from URL" onCancel={onCancel}>
      <form
        onSubmit={event => {
          event.preventDefault()
          const target = resolveImportUrl(text)
          if (target) onAdd(target)
          else setInvalid(true)
        }}
      >
        <h2>Add from URL</h2>
        <p>
          An arXiv paper, a GitHub repository, folder or file, or a link to any file its site lets
          web pages download.
        </p>
        <input
          ref={inputRef}
          className="dialog-input"
          type="url"
          aria-label="Address"
          placeholder="https://arxiv.org/abs/1706.03762"
          value={text}
          aria-invalid={invalid}
          onChange={event => {
            setText(event.target.value)
            setInvalid(false)
          }}
        />
        {invalid && (
          <p role="alert">Paste an https address, such as an arXiv paper or a GitHub repository.</p>
        )}
        <div className="dialog-actions">
          <button type="button" className="text-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={!text.trim()}>
            Add
          </button>
        </div>
      </form>
    </Modal>
  )
}
