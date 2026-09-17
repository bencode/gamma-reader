import * as Popover from '@radix-ui/react-popover'
import { ALargeSmall, Check } from 'lucide-react'
import { type CSSProperties, type ReactNode, useId } from 'react'
import styles from './style.module.scss'

export type ReadingOption<T extends string> = {
  value: T
  label: string
}

export type ReadingThemeOption<T extends string> = ReadingOption<T> & {
  background: string
  foreground: string
}

export const ReadingAppearancePopover = ({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) => (
  <Popover.Root>
    <Popover.Trigger asChild>
      <button
        type="button"
        className={`icon-button ${className ?? ''}`}
        aria-label="Reading appearance"
        title="Reading appearance"
      >
        <ALargeSmall size={16} />
      </button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content
        className={styles.popover}
        align="end"
        sideOffset={5}
        collisionPadding={12}
        aria-label="Reading appearance"
      >
        <h2>Reading appearance</h2>
        {children}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
)

export const ReadingAppearanceNote = ({ children }: { children: ReactNode }) => (
  <p className={styles.note}>{children}</p>
)

export const ReadingRangeSetting = ({
  label,
  value,
  minimum,
  maximum,
  onChange,
}: {
  label: string
  value: number
  minimum: number
  maximum: number
  onChange: (value: number) => void
}) => {
  const id = useId()
  return (
    <div className={styles.setting}>
      <div className={styles.settingHeader}>
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{value} px</output>
      </div>
      <div className={styles.range}>
        <span className={styles.smallType} aria-hidden="true">
          A
        </span>
        <input
          id={id}
          type="range"
          min={minimum}
          max={maximum}
          step={1}
          value={value}
          aria-valuetext={`${value} pixels`}
          onChange={event => onChange(Number(event.target.value))}
        />
        <span className={styles.largeType} aria-hidden="true">
          A
        </span>
      </div>
    </div>
  )
}

export function ReadingSegmentedSetting<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly ReadingOption<T>[]
  onChange: (value: T) => void
}) {
  return (
    <fieldset className={styles.setting}>
      <legend>{label}</legend>
      <div className={styles.segments}>
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            className={option.value === value ? styles.selectedSegment : undefined}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

export function ReadingThemeSetting<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: readonly ReadingThemeOption<T>[]
  onChange: (value: T) => void
}) {
  const name = useId()
  return (
    <fieldset className={styles.setting}>
      <legend>Theme</legend>
      <div className={styles.themes} role="radiogroup" aria-label="Reading theme">
        {options.map(option => {
          const selected = option.value === value
          return (
            <label
              key={option.value}
              className={`${styles.themeOption} ${selected ? styles.selectedTheme : ''}`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
              />
              <span
                className={styles.swatch}
                style={
                  {
                    '--swatch-background': option.background,
                    '--swatch-foreground': option.foreground,
                  } as CSSProperties
                }
                aria-hidden="true"
              >
                Aa
                {selected && <Check size={12} />}
              </span>
              <span>{option.label}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
