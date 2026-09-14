import { ChevronDown, FolderCheck, FolderDown, LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FileExportController } from './use-file-export'

export const FolderExportIcon = ({ exporter }: { exporter: FileExportController }) => {
  if (exporter.phase === 'saving')
    return <LoaderCircle className="folder-save-spinner" size={16} aria-hidden="true" />
  if (exporter.targetName && !exporter.dirty) return <FolderCheck size={16} aria-hidden="true" />
  return <FolderDown size={16} aria-hidden="true" />
}

const saveLabel = (exporter: FileExportController) => {
  if (!exporter.supported) return 'Save to folder'
  if (exporter.phase === 'loading') return 'Loading saved folder'
  if (exporter.phase === 'saving')
    return exporter.targetName ? `Saving files to ${exporter.targetName}` : 'Saving files'
  if (!exporter.targetName) return 'Save files to folder'
  if (exporter.dirty) return `Save changes to ${exporter.targetName}`
  return `Save files to ${exporter.targetName}`
}

const saveTitle = (exporter: FileExportController) =>
  exporter.supported ? saveLabel(exporter) : 'Saving folders requires desktop Chrome or Edge.'

export const FolderExportControl = ({
  exporter,
  disabled,
}: {
  exporter: FileExportController
  disabled: boolean
}) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const label = saveLabel(exporter)
  const busy = exporter.phase !== 'idle' || exporter.savingFileId !== null
  const controlDisabled = disabled || busy || !exporter.supported

  useEffect(() => {
    if (!menuOpen) return
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setMenuOpen(false)
      menuButtonRef.current?.focus()
    }
    document.addEventListener('pointerdown', closeOnPointerDown)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])

  return (
    <div className="folder-save-control" ref={rootRef}>
      <button
        className={`icon-button folder-save-main${exporter.dirty ? ' dirty' : ''}`}
        type="button"
        aria-label={label}
        title={saveTitle(exporter)}
        disabled={controlDisabled}
        onClick={() => void exporter.saveToFolder()}
      >
        <FolderExportIcon exporter={exporter} />
      </button>
      {exporter.targetName && (
        <button
          ref={menuButtonRef}
          className="icon-button folder-save-menu-button"
          type="button"
          aria-label="Folder save options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          disabled={controlDisabled}
          onClick={() => setMenuOpen(open => !open)}
        >
          <ChevronDown size={12} aria-hidden="true" />
        </button>
      )}
      {menuOpen && exporter.targetName && (
        <div className="folder-save-menu" role="menu">
          <p title={exporter.targetName}>Saving to {exporter.targetName}</p>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false)
              void exporter.chooseAnotherFolder()
            }}
          >
            Choose another folder…
          </button>
        </div>
      )}
    </div>
  )
}

export const folderExportLabel = saveLabel
export const folderExportTitle = saveTitle
