import type { AgentModelConfig, AgentSelection } from '@gamma-reader/server/agent-contract'

export type ModelConfiguration = {
  models: readonly AgentModelConfig[]
  selection: AgentSelection
}

export const ConversationModelControl = ({
  configuration,
  disabled,
  onChange,
}: {
  configuration: ModelConfiguration
  disabled: boolean
  onChange: (selection: AgentSelection) => void
}) => {
  const { models, selection } = configuration
  const model = models.find(candidate => candidate.id === selection.modelId)
  return (
    <div className="composer-model-controls">
      <select
        aria-label="Chat model"
        title="Chat model"
        value={selection.modelId}
        disabled={disabled}
        onChange={event => {
          const next = models.find(candidate => candidate.id === event.target.value)
          if (next)
            onChange({
              modelId: next.id,
              effort: next.efforts.includes(selection.effort)
                ? selection.effort
                : next.defaultEffort,
            })
        }}
      >
        {models.map(candidate => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.label}
          </option>
        ))}
      </select>
      {Boolean(model?.efforts.length) && (
        <select
          aria-label="Reasoning effort"
          title="Reasoning effort"
          value={selection.effort}
          disabled={disabled}
          onChange={event => {
            const effort = model?.efforts.find(candidate => candidate === event.target.value)
            if (effort) onChange({ ...selection, effort })
          }}
        >
          {model?.efforts.map(effort => (
            <option key={effort} value={effort}>
              {effort === 'off' ? 'Thinking off' : `Effort: ${effort}`}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
