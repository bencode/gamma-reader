import styles from './style.module.scss'

export type SlashCommand = { name: string; description: string; run: () => void }

// A command is typed as one word; a space or a line break turns it back into a message.
export const isCommandInput = (text: string) => /^\/\S*$/.test(text)

export const matchCommands = (input: string, commands: readonly SlashCommand[]) =>
  commands.filter(command => command.name.startsWith(input.slice(1)))

export const commandOptionId = (menuId: string, index: number) => `${menuId}-${index}`

export const SlashCommandMenu = ({
  id,
  commands,
  selected,
  onRun,
}: {
  id: string
  commands: readonly SlashCommand[]
  selected: number
  onRun: (command: SlashCommand) => void
}) => (
  <div id={id} role="listbox" aria-label="Commands" className={styles.commandMenu}>
    {commands.map((command, index) => (
      <button
        type="button"
        key={command.name}
        id={commandOptionId(id, index)}
        role="option"
        aria-selected={index === selected}
        tabIndex={-1}
        className={styles.commandOption}
        // The textarea keeps focus and handles the keys.
        onMouseDown={event => event.preventDefault()}
        onClick={() => onRun(command)}
      >
        <span className={styles.commandName}>/{command.name}</span>
        <span className={styles.commandDescription}>{command.description}</span>
      </button>
    ))}
  </div>
)
