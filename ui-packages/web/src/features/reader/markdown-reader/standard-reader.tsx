import {
  ReadingAppearancePopover,
  type ReadingOption,
  ReadingRangeSetting,
  ReadingSegmentedSetting,
  type ReadingThemeOption,
  ReadingThemeSetting,
} from '../../../components/reading-appearance'
import type { TextReaderProps } from '../text-file-reader'
import { MarkdownReader } from './index'
import {
  type MarkdownReadingTheme,
  type MarkdownReadingWidth,
  useMarkdownReadingPreferences,
} from './reading-preferences'
import styles from './style.module.scss'

const widthOptions: readonly ReadingOption<MarkdownReadingWidth>[] = [
  { value: 'focused', label: 'Focused' },
  { value: 'full', label: 'Full width' },
]
const themeOptions: readonly ReadingThemeOption<MarkdownReadingTheme>[] = [
  { value: 'light', label: 'Light', background: '#ffffff', foreground: '#333333' },
  { value: 'paper', label: 'Paper', background: '#f3ead2', foreground: '#302b26' },
  { value: 'dark', label: 'Dark', background: '#1d1f20', foreground: '#e7e2d8' },
]

export const StandardMarkdownReader = (props: TextReaderProps) => {
  const [preferences, onPreferencesChange] = useMarkdownReadingPreferences()
  const controls = (
    <ReadingAppearancePopover className={styles.appearanceToggle}>
      <ReadingRangeSetting
        label="Text size"
        value={preferences.fontSize}
        minimum={12}
        maximum={20}
        onChange={fontSize => onPreferencesChange({ ...preferences, fontSize })}
      />
      <ReadingSegmentedSetting
        label="Page width"
        value={preferences.width}
        options={widthOptions}
        onChange={width => onPreferencesChange({ ...preferences, width })}
      />
      <ReadingThemeSetting
        value={preferences.theme}
        options={themeOptions}
        onChange={theme => onPreferencesChange({ ...preferences, theme })}
      />
    </ReadingAppearancePopover>
  )
  return <MarkdownReader {...props} appearance={{ preferences, controls }} />
}
