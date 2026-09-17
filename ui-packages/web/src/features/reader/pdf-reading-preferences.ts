import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import type { PdfReadingTheme } from '../../components/pdf-reader'

const storageKey = 'gamma-reader.pdf-reading-preferences'
const themes: readonly PdfReadingTheme[] = ['original', 'paper', 'dark']
const isTheme = (value: unknown): value is PdfReadingTheme =>
  typeof value === 'string' && themes.some(theme => theme === value)

const readTheme = (): PdfReadingTheme => {
  try {
    const theme = localStorage.getItem(storageKey)
    return isTheme(theme) ? theme : 'original'
  } catch (error) {
    console.error('Unable to read PDF preferences', error)
    return 'original'
  }
}

type PdfReadingPreferenceState = {
  theme: PdfReadingTheme
  setTheme: (theme: PdfReadingTheme) => void
}

const preferenceStore = createStore<PdfReadingPreferenceState>(set => ({
  theme: readTheme(),
  setTheme: theme => {
    try {
      localStorage.setItem(storageKey, theme)
    } catch (error) {
      console.error('Unable to save PDF preferences', error)
    }
    set({ theme })
  },
}))

export const usePdfReadingTheme = () => {
  const theme = useStore(preferenceStore, state => state.theme)
  const setTheme = useStore(preferenceStore, state => state.setTheme)
  return [theme, setTheme] as const
}
