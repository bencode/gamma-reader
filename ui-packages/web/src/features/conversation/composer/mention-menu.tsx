import type { MentionOption } from './mentions'
import { commandOptionId } from './slash-command-menu'
import styles from './style.module.scss'

export const MentionMenu = ({
  id,
  label,
  options,
  selected,
  onPick,
}: {
  id: string
  label: string
  options: readonly MentionOption[]
  selected: number
  onPick: (index: number) => void
}) => (
  <div id={id} role="listbox" aria-label={label} className={styles.commandMenu}>
    {options.map((option, index) => (
      <button
        type="button"
        key={option.id}
        id={commandOptionId(id, index)}
        role="option"
        aria-selected={index === selected}
        tabIndex={-1}
        className={styles.commandOption}
        title={option.title}
        // The textarea keeps focus and handles the keys.
        onMouseDown={event => event.preventDefault()}
        onClick={() => onPick(index)}
      >
        <span className={styles.fileName}>{option.name}</span>
        <span className={styles.commandDescription}>{option.detail}</span>
      </button>
    ))}
  </div>
)
