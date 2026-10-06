import { ConfirmationDialog } from '../../components/confirmation-dialog'
import styles from './shortcuts-dialog.module.scss'

type Shortcut = { keys: string; action: string }
type ShortcutGroup = { title: string; shortcuts: readonly Shortcut[] }

// Kept by hand: a shortcut added elsewhere is listed here too.
const shortcutGroups: readonly ShortcutGroup[] = [
  {
    title: 'Reading assistant',
    shortcuts: [
      { keys: 'Enter', action: 'Send' },
      { keys: 'Shift+Enter', action: 'New line' },
      { keys: 'Esc', action: 'Stop the answer' },
      { keys: '⌘/Ctrl+V', action: 'Paste an image or file to attach' },
      { keys: '/', action: 'Commands' },
    ],
  },
  { title: 'Documents', shortcuts: [{ keys: '⌘/Ctrl+S', action: 'Save to browser' }] },
  {
    title: 'Labs',
    shortcuts: [
      { keys: '⌘/Ctrl+Enter', action: 'Run cell' },
      { keys: 'Shift+Enter', action: 'Run and go on to the next cell' },
    ],
  },
  {
    title: 'Image preview',
    shortcuts: [
      { keys: '← →', action: 'Previous / next image' },
      { keys: 'Esc', action: 'Close' },
    ],
  },
]

export const ShortcutsDialog = ({ onClose }: { onClose: () => void }) => (
  <ConfirmationDialog label="Keyboard shortcuts" onCancel={onClose}>
    <h2>Keyboard shortcuts</h2>
    {shortcutGroups.map(group => (
      <section key={group.title} className={styles.group}>
        <h3>{group.title}</h3>
        <dl>
          {group.shortcuts.map(shortcut => (
            <div key={shortcut.keys}>
              <dt>
                <kbd>{shortcut.keys}</kbd>
              </dt>
              <dd>{shortcut.action}</dd>
            </div>
          ))}
        </dl>
      </section>
    ))}
    <div className="dialog-actions">
      <button type="button" className="text-button" onClick={onClose}>
        Close
      </button>
    </div>
  </ConfirmationDialog>
)
