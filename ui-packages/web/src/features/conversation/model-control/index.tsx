import { getSupportedThinkingLevels, type ModelThinkingLevel } from '@earendil-works/pi-ai'
import type { ModelReference } from '@gamma-reader/shared/model-config'
import type { ModelSelection } from '../../../core/conversations'
import type { ModelRuntime } from '../../agent/model-runtime'
import styles from './style.module.scss'

export type ModelControlProps = {
  providers: ModelRuntime['providers']
  selection: ModelSelection
  disabled: boolean
  onModelChange: (model: ModelReference) => void
  onEffortChange: (effort: ModelThinkingLevel) => void
}

export const ConversationModelControl = ({
  providers,
  selection,
  disabled,
  onModelChange,
  onEffortChange,
}: ModelControlProps) => {
  const available = providers.flatMap(provider => provider.models)
  const selectedIndex = available.findIndex(
    model => model.provider === selection.provider && model.id === selection.modelId,
  )
  const model = available[selectedIndex]
  const efforts = model ? getSupportedThinkingLevels(model) : []
  return (
    <div className={styles.controls}>
      <select
        aria-label="Chat model"
        title="Chat model"
        value={selectedIndex}
        disabled={disabled}
        onChange={event => {
          const next = available[Number(event.target.value)]
          if (next) onModelChange({ provider: next.provider, modelId: next.id })
        }}
      >
        {providers.map(provider => (
          <optgroup key={provider.id} label={provider.name}>
            {provider.models.map(candidate => (
              <option key={candidate.id} value={available.indexOf(candidate)}>
                {candidate.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {efforts.length > 1 && (
        <select
          aria-label="Reasoning effort"
          title="Reasoning effort"
          value={selection.effort}
          disabled={disabled}
          onChange={event => {
            const effort = efforts.find(value => value === event.target.value)
            if (effort) onEffortChange(effort)
          }}
        >
          {efforts.map(effort => (
            <option key={effort} value={effort}>
              {effort}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
