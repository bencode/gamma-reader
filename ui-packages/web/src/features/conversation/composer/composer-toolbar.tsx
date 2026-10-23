import { Globe, Paperclip } from 'lucide-react'
import { useRef } from 'react'
import { ConversationModelControl, type ModelControlProps } from '../model-control'
import type { ConversationTokenUsage } from '../token-usage'
import styles from './style.module.scss'
import { TokenUsageStatus } from './token-usage-status'

type ComposerToolbarProps = {
  onAdd: (files: readonly File[]) => void
  limitReached: boolean
  adding: boolean
  // Absent where the server has no search service.
  webSearch: { enabled: boolean; set: (on: boolean) => void } | null
  modelConfiguration: Pick<ModelControlProps, 'providers' | 'selection'> | null
  // Models change only between replies.
  modelDisabled: boolean
  onModelChange: ModelControlProps['onModelChange']
  onEffortChange: ModelControlProps['onEffortChange']
  onConfigureModels: ModelControlProps['onConfigure']
  tokenUsage: ConversationTokenUsage | null
}

// The row under the draft: attaching files, web search, the model, and how much context is used.
export const ComposerToolbar = ({
  onAdd,
  limitReached,
  adding,
  webSearch,
  modelConfiguration,
  modelDisabled,
  onModelChange,
  onEffortChange,
  onConfigureModels,
  tokenUsage,
}: ComposerToolbarProps) => {
  const pickerRef = useRef<HTMLInputElement>(null)
  return (
    <div className={styles.bottom}>
      <button
        type="button"
        className={`icon-button ${styles.attachmentPicker}`}
        aria-label="Attach files"
        title={
          limitReached
            ? 'Remove an attachment before adding another'
            : 'Attach files — or paste or drop them here'
        }
        disabled={limitReached || adding}
        onClick={() => pickerRef.current?.click()}
      >
        <Paperclip size={16} />
      </button>
      <input
        ref={pickerRef}
        className="visually-hidden"
        type="file"
        multiple
        aria-label="Choose chat attachments"
        onChange={event => {
          onAdd(Array.from(event.currentTarget.files ?? []))
          event.currentTarget.value = ''
        }}
      />
      {webSearch && (
        <button
          type="button"
          className={`icon-button ${styles.attachmentPicker} ${styles.webSearch}`}
          aria-label="Search the web"
          aria-pressed={webSearch.enabled}
          title={webSearch.enabled ? 'Web search is on' : 'Web search is off'}
          onClick={() => webSearch.set(!webSearch.enabled)}
        >
          <Globe size={16} />
        </button>
      )}
      {modelConfiguration && (
        <ConversationModelControl
          {...modelConfiguration}
          disabled={modelDisabled}
          onModelChange={onModelChange}
          onEffortChange={onEffortChange}
          onConfigure={onConfigureModels}
        />
      )}
      {limitReached && <span className={styles.attachmentLimit}>10 attachments maximum</span>}
      {tokenUsage && <TokenUsageStatus usage={tokenUsage} />}
    </div>
  )
}
