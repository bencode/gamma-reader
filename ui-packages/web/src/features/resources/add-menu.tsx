import * as Popover from '@radix-ui/react-popover'
import { FilePlus, FolderPlus, Plus } from 'lucide-react'
import { useState } from 'react'

type AddMenuProps = {
  disabled: boolean
  // Absent where the browser cannot choose a folder; the button then adds files directly.
  onAddFolder?: () => void
  onAddFiles: () => void
}

// One entry point for bringing things in, so it never reads like the folder save beside it.
export const AddMenu = ({ disabled, onAddFolder, onAddFiles }: AddMenuProps) => {
  const [open, setOpen] = useState(false)
  if (!onAddFolder)
    return (
      <button
        className="icon-button"
        type="button"
        aria-label="Add files"
        title="Add files"
        disabled={disabled}
        onClick={onAddFiles}
      >
        <Plus size={16} />
      </button>
    )
  // Closing first keeps the picker that follows from opening behind the menu.
  const choose = (action: () => void) => () => {
    setOpen(false)
    action()
  }
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className="icon-button"
          type="button"
          aria-label="Add files or a folder"
          title="Add"
          disabled={disabled}
        >
          <Plus size={16} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="add-menu" role="menu" align="end" sideOffset={4}>
          <button type="button" role="menuitem" onClick={choose(onAddFiles)}>
            <FilePlus size={14} aria-hidden="true" />
            Add files…
          </button>
          <button type="button" role="menuitem" onClick={choose(onAddFolder)}>
            <FolderPlus size={14} aria-hidden="true" />
            Add folder…
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
