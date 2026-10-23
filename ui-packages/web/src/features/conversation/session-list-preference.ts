import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

// Whether the conversation list under the assistant's title is open; closed until the reader
// opens it, and remembered in this browser.
const storageKey = 'gamma-reader.session-list-open'

const readOpen = () => {
  try {
    return localStorage.getItem(storageKey) === 'open'
  } catch (error) {
    console.error('Unable to read the conversation list setting', error)
    return false
  }
}

type SessionListPreferenceState = {
  open: boolean
  setOpen: (open: boolean) => void
}

const preferenceStore = createStore<SessionListPreferenceState>(set => ({
  open: readOpen(),
  setOpen: open => {
    try {
      if (open) localStorage.setItem(storageKey, 'open')
      else localStorage.removeItem(storageKey)
    } catch (error) {
      console.error('Unable to save the conversation list setting', error)
    }
    set({ open })
  },
}))

export const useSessionListOpen = () => {
  const open = useStore(preferenceStore, state => state.open)
  const setOpen = useStore(preferenceStore, state => state.setOpen)
  return [open, setOpen] as const
}
