import { useStore } from 'zustand'
import type { NoteIndexStore } from './use-note-index'

// The one line that follows indexing, so each parsed file redraws only this.
export const IndexStatus = ({ index }: { index: NoteIndexStore }) => {
  const progress = useStore(index, state => state.progress)
  if (!progress) return null
  return (
    <p className="file-progress" role="status">
      Indexing links… {progress.done.toLocaleString()} of {progress.total.toLocaleString()}
    </p>
  )
}
