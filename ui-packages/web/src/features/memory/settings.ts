import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

// One switch for the whole browser, off until the reader turns it on.
const storageKey = 'gamma-reader.memory'

// Read afresh each time, so a tab sees the switch another tab turned.
export const memoryEnabled = () => {
  try {
    return localStorage.getItem(storageKey) === 'on'
  } catch (error) {
    console.error('Unable to read the memory setting', error)
    return false
  }
}

const settingStore = createStore<{ enabled: boolean }>(() => ({ enabled: memoryEnabled() }))

export const setMemoryEnabled = (enabled: boolean) => {
  try {
    if (enabled) localStorage.setItem(storageKey, 'on')
    else localStorage.removeItem(storageKey)
  } catch (error) {
    console.error('Unable to save the memory setting', error)
  }
  settingStore.setState({ enabled })
}

export const useMemoryEnabled = () => useStore(settingStore, state => state.enabled)

// Takes up a change made in another tab, which this tab's store has not heard of.
export const refreshMemoryEnabled = () => settingStore.setState({ enabled: memoryEnabled() })
