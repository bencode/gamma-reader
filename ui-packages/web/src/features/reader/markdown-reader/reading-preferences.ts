import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

export type MarkdownReadingTheme = 'light' | 'paper' | 'dark'
export type MarkdownReadingWidth = 'focused' | 'full'

export type MarkdownReadingPreferences = {
  fontSize: number
  width: MarkdownReadingWidth
  theme: MarkdownReadingTheme
}

export const defaultMarkdownReadingPreferences: MarkdownReadingPreferences = {
  fontSize: 15,
  width: 'focused',
  theme: 'light',
}

const storageKey = 'gamma-reader.markdown-reading-preferences'
const themes: readonly MarkdownReadingTheme[] = ['light', 'paper', 'dark']
const widths: readonly MarkdownReadingWidth[] = ['focused', 'full']
const isTheme = (value: unknown): value is MarkdownReadingTheme =>
  typeof value === 'string' && themes.some(theme => theme === value)
const isWidth = (value: unknown): value is MarkdownReadingWidth =>
  typeof value === 'string' && widths.some(width => width === value)

const readPreferences = (): MarkdownReadingPreferences => {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return defaultMarkdownReadingPreferences
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return defaultMarkdownReadingPreferences
    const candidate = value as Partial<MarkdownReadingPreferences>
    return {
      fontSize:
        typeof candidate.fontSize === 'number' &&
        Number.isInteger(candidate.fontSize) &&
        candidate.fontSize >= 12 &&
        candidate.fontSize <= 20
          ? candidate.fontSize
          : defaultMarkdownReadingPreferences.fontSize,
      width: isWidth(candidate.width) ? candidate.width : defaultMarkdownReadingPreferences.width,
      theme: isTheme(candidate.theme) ? candidate.theme : defaultMarkdownReadingPreferences.theme,
    }
  } catch (error) {
    console.error('Unable to read Markdown preferences', error)
    return defaultMarkdownReadingPreferences
  }
}

type MarkdownReadingPreferenceState = {
  preferences: MarkdownReadingPreferences
  setPreferences: (preferences: MarkdownReadingPreferences) => void
}

const preferenceStore = createStore<MarkdownReadingPreferenceState>(set => ({
  preferences: readPreferences(),
  setPreferences: preferences => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(preferences))
    } catch (error) {
      console.error('Unable to save Markdown preferences', error)
    }
    set({ preferences })
  },
}))

export const useMarkdownReadingPreferences = () => {
  const preferences = useStore(preferenceStore, state => state.preferences)
  const setPreferences = useStore(preferenceStore, state => state.setPreferences)
  return [preferences, setPreferences] as const
}
