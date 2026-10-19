import type { ConversationReference } from '../../../core/reader-message'
import { baseName } from '../../../utils/path'
import { commandOptionId } from './slash-command-menu'
import styles from './style.module.scss'

const folderOf = (path: string) => path.slice(0, Math.max(path.lastIndexOf('/'), 0))

export const FileMentionMenu = ({
  id,
  files,
  selected,
  onPick,
}: {
  id: string
  files: readonly ConversationReference[]
  selected: number
  onPick: (file: ConversationReference) => void
}) => (
  <div id={id} role="listbox" aria-label="Files" className={styles.commandMenu}>
    {files.map((file, index) => (
      <button
        type="button"
        key={file.id}
        id={commandOptionId(id, index)}
        role="option"
        aria-selected={index === selected}
        tabIndex={-1}
        className={styles.commandOption}
        title={file.path}
        // The textarea keeps focus and handles the keys.
        onMouseDown={event => event.preventDefault()}
        onClick={() => onPick(file)}
      >
        <span className={styles.fileName}>{baseName(file.path)}</span>
        <span className={styles.commandDescription}>{folderOf(file.path)}</span>
      </button>
    ))}
  </div>
)
