import { Hand, Minus, PanelLeft, Plus } from 'lucide-react'
import {
  ReadingAppearanceNote,
  ReadingAppearancePopover,
  type ReadingThemeOption,
  ReadingThemeSetting,
} from '../reading-appearance'
import styles from './style.module.scss'

export type PdfReadingTheme = 'original' | 'paper' | 'dark'

const themeOptions: readonly ReadingThemeOption<PdfReadingTheme>[] = [
  { value: 'original', label: 'Original', background: '#ffffff', foreground: '#333333' },
  { value: 'paper', label: 'Paper', background: '#f3ead2', foreground: '#302b26' },
  { value: 'dark', label: 'Dark', background: '#1d1f20', foreground: '#e7e2d8' },
]

type PdfToolbarProps = {
  zoom: number
  outlineAvailable: boolean
  outlineOpen: boolean
  panAvailable: boolean
  panActive: boolean
  theme: PdfReadingTheme
  onZoomChange: (zoom: number) => void
  onToggleOutline: () => void
  onPanActiveChange: (active: boolean) => void
  onThemeChange: (theme: PdfReadingTheme) => void
}

export const PdfToolbar = ({
  zoom,
  outlineAvailable,
  outlineOpen,
  panAvailable,
  panActive,
  theme,
  onZoomChange,
  onToggleOutline,
  onPanActiveChange,
  onThemeChange,
}: PdfToolbarProps) => (
  <div
    className={`preview-toolbar ${styles.toolbar} ${outlineAvailable ? styles.toolbarWithOutline : ''}`}
    role="toolbar"
    aria-label="PDF controls"
  >
    {outlineAvailable && (
      <button
        type="button"
        className={
          outlineOpen
            ? `icon-button ${styles.outlineToggle} ${styles.activeControl}`
            : `icon-button ${styles.outlineToggle}`
        }
        aria-label={outlineOpen ? 'Hide table of contents' : 'Show table of contents'}
        aria-pressed={outlineOpen}
        title={outlineOpen ? 'Hide table of contents' : 'Show table of contents'}
        onClick={onToggleOutline}
      >
        <PanelLeft size={16} />
      </button>
    )}
    <span className={styles.controls}>
      <button
        type="button"
        className={panActive ? `icon-button ${styles.activeControl}` : 'icon-button'}
        aria-label={panActive ? 'Select text' : 'Pan document'}
        aria-pressed={panActive}
        title={panActive ? 'Select text' : 'Pan document'}
        disabled={!panAvailable}
        onClick={() => onPanActiveChange(!panActive)}
      >
        <Hand size={15} />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="Zoom out"
        disabled={zoom <= 0.5}
        onClick={() => onZoomChange(zoom - 0.1)}
      >
        <Minus size={15} />
      </button>
      <button type="button" className="toolbar-value" onClick={() => onZoomChange(1)}>
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="Zoom in"
        disabled={zoom >= 2}
        onClick={() => onZoomChange(zoom + 0.1)}
      >
        <Plus size={15} />
      </button>
    </span>
    <ReadingAppearancePopover className={styles.appearanceToggle}>
      <ReadingThemeSetting value={theme} options={themeOptions} onChange={onThemeChange} />
      <ReadingAppearanceNote>Paper and Dark recolor document pages.</ReadingAppearanceNote>
    </ReadingAppearancePopover>
  </div>
)
