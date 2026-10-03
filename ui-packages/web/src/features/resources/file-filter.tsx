import { LoaderCircle, Search } from 'lucide-react'
import { useState, useTransition } from 'react'

// The box keeps what is typed, so a key press redraws only the box. The library hears of it in a
// transition: a long list being drawn gives way to the next key instead of holding it up.
export const FileFilter = ({
  count,
  onQueryChange,
  onSubmit,
}: {
  count: number
  onQueryChange: (query: string) => void
  onSubmit: (query: string) => void
}) => {
  const [value, setValue] = useState('')
  const [pending, startTransition] = useTransition()
  const change = (next: string) => {
    setValue(next)
    startTransition(() => onQueryChange(next))
  }
  return (
    <label className="resource-filter">
      {pending ? (
        <LoaderCircle className="folder-save-spinner" size={13} aria-hidden="true" />
      ) : (
        <Search size={13} aria-hidden="true" />
      )}
      <input
        type="search"
        aria-label="Filter files"
        placeholder={`Filter ${count.toLocaleString()} ${count === 1 ? 'file' : 'files'}`}
        value={value}
        onChange={event => change(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Escape' && value) {
            event.preventDefault()
            change('')
          } else if (event.key === 'Enter') {
            event.preventDefault()
            onSubmit(value)
          }
        }}
      />
    </label>
  )
}
