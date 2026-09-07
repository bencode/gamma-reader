import { MessageSquarePlus } from 'lucide-react'
import { type RefObject, useState } from 'react'

export type SelectedText = { text: string; left: number; top: number }

export const useReaderSelection = ({
  active,
  rootRef,
  boundaryRef,
  resetKey,
}: {
  active: boolean
  rootRef: RefObject<HTMLElement | null>
  boundaryRef: RefObject<HTMLElement | null>
  resetKey: string
}) => {
  const selectionKey = `${active ? 'active' : 'hidden'}:${resetKey}`
  const [state, setState] = useState<{ key: string; selection: SelectedText | null }>({
    key: selectionKey,
    selection: null,
  })
  if (state.key !== selectionKey) setState({ key: selectionKey, selection: null })
  const selection = state.key === selectionKey ? state.selection : null
  const setSelection = (next: SelectedText | null) =>
    setState({ key: selectionKey, selection: next })

  const captureSelection = () => {
    const selected = window.getSelection()
    const boundary = boundaryRef.current
    const root = rootRef.current
    if (!selected?.rangeCount || !selected.toString().trim() || !boundary || !root) {
      setSelection(null)
      return
    }
    const range = selected.getRangeAt(0)
    if (!boundary.contains(range.startContainer) || !boundary.contains(range.endContainer)) {
      setSelection(null)
      return
    }
    const rect = range.getBoundingClientRect()
    const bounds = root.getBoundingClientRect()
    setSelection({
      text: selected.toString().trim(),
      left: Math.max(12, Math.min(rect.right - bounds.left - 100, bounds.width - 116)),
      top: Math.max(8, Math.min(rect.bottom - bounds.top + 8, bounds.height - 48)),
    })
  }

  return { selection, setSelection, captureSelection }
}

export const ReaderSelectionAction = ({
  selection,
  onAsk,
}: {
  selection: SelectedText
  onAsk: (text: string) => void
}) => (
  <button
    className="selection-action"
    type="button"
    style={{ left: selection.left, top: selection.top }}
    onClick={() => onAsk(selection.text)}
  >
    <MessageSquarePlus size={15} /> Ask AI
  </button>
)
