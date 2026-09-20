import type { Api, Model } from '@earendil-works/pi-ai'
import { useEffect, useId, useState } from 'react'
import { ConfirmationDialog } from '../../../components/confirmation-dialog'
import { catalog, catalogEntry, customProviderId } from '../../../core/byok/catalog'
import { type DiscoveryFailure, listModels } from '../../../core/byok/discover'
import { removeUserProvider, saveUserProvider, useUserProviders } from '../../../core/byok/store'
import { visionCandidates } from '../../../core/byok/vision-models'
import styles from './style.module.scss'

const failureText: Record<DiscoveryFailure, string> = {
  key: 'That key was not accepted by this service.',
  endpoint: 'That address does not answer like an OpenAI-compatible API.',
  // The one failure a reader cannot diagnose alone: the request never reached
  // them, and the browser reports nothing beyond "it failed".
  blocked: 'That address does not allow browsers to reach it directly (no CORS headers).',
  unreachable: 'Could not reach that address.',
  unknown: 'That service could not be asked for its models.',
}

const preselectLimit = 10

type Draft = {
  provider: string
  apiKey: string
  baseUrl: string
  label: string
  models: string[]
  visionModel: string
}

const emptyDraft: Draft = {
  provider: catalog[0]?.id ?? customProviderId,
  apiKey: '',
  baseUrl: '',
  label: '',
  models: [],
  visionModel: '',
}

type Phase =
  | { step: 'editing' }
  | { step: 'checking' }
  | { step: 'failed'; reason: DiscoveryFailure }
  | { step: 'choosing'; offered: readonly Model<Api>[] }

export const ModelProviderDialog = ({ onClose }: { onClose: () => void }) => {
  const configured = useUserProviders()
  const [draft, setDraft] = useState(emptyDraft)
  const [phase, setPhase] = useState<Phase>({ step: 'editing' })
  const [search, setSearch] = useState('')
  const fieldId = useId()
  const custom = draft.provider === customProviderId

  useEffect(() => {
    setPhase({ step: 'editing' })
    setSearch('')
  }, [])

  const offer = (models: readonly Model<Api>[]) => {
    setPhase({ step: 'choosing', offered: models })
    setDraft(current => ({
      ...current,
      // A list short enough to read at a glance is not worth making anyone tick
      // through; a list of hundreds has to be narrowed before it is useful.
      models: models.length <= preselectLimit ? models.map(model => model.id) : [],
    }))
  }

  const check = async () => {
    setPhase({ step: 'checking' })
    if (custom) {
      const found = await listModels(draft.baseUrl, draft.apiKey)
      if (!found.ok) return setPhase({ step: 'failed', reason: found.reason })
      return offer(
        found.models.map(id => ({ id, name: id, input: ['text', 'image'] }) as Model<Api>),
      )
    }
    const entry = catalogEntry(draft.provider)
    if (!entry) return setPhase({ step: 'failed', reason: 'endpoint' })
    const provider = await entry.load()
    const found = await listModels(provider.baseUrl ?? '', draft.apiKey)
    if (!found.ok) return setPhase({ step: 'failed', reason: found.reason })
    offer(provider.getModels())
  }

  const save = () => {
    saveUserProvider({
      id: custom ? draft.label.trim() || draft.baseUrl : draft.provider,
      apiKey: draft.apiKey.trim(),
      models: draft.models,
      ...(draft.visionModel ? { visionModel: draft.visionModel } : {}),
      ...(custom ? { baseUrl: draft.baseUrl.trim(), label: draft.label.trim() } : {}),
    })
    setDraft(emptyDraft)
    setPhase({ step: 'editing' })
  }

  const offered = phase.step === 'choosing' ? phase.offered : []
  const matching = offered.filter(model =>
    `${model.id} ${model.name}`.toLowerCase().includes(search.trim().toLowerCase()),
  )
  const chosen = offered.filter(model => draft.models.includes(model.id))
  const visionOptions = visionCandidates(chosen)

  return (
    <ConfirmationDialog label="Model providers" onCancel={onClose}>
      <div className={styles.dialog}>
        <header className={styles.header}>
          <h2>Your models</h2>
          <p className={styles.note}>
            Keys are kept in this browser and are never sent to Gamma Reader. Models you add here
            run on your own key and are not counted against the free allowance.
          </p>
        </header>

        {configured.length > 0 && (
          <ul className={styles.configured}>
            {configured.map(provider => (
              <li key={provider.id}>
                <span className={styles.name}>{provider.label || provider.id}</span>
                <span className={styles.count}>{provider.models.length} models</span>
                <button type="button" onClick={() => removeUserProvider(provider.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <fieldset className={styles.form} disabled={phase.step === 'checking'}>
          <legend>Add a provider</legend>

          <label htmlFor={`${fieldId}-provider`}>Provider</label>
          <select
            id={`${fieldId}-provider`}
            value={draft.provider}
            onChange={event => {
              setDraft({ ...emptyDraft, provider: event.target.value })
              setPhase({ step: 'editing' })
            }}
          >
            {catalog.map(entry => (
              <option key={entry.id} value={entry.id}>
                {entry.id}
              </option>
            ))}
            <option value={customProviderId}>Another OpenAI-compatible service…</option>
          </select>

          {custom && (
            <>
              <label htmlFor={`${fieldId}-label`}>Name</label>
              <input
                id={`${fieldId}-label`}
                value={draft.label}
                placeholder="What to call it"
                onChange={event => setDraft({ ...draft, label: event.target.value })}
              />
              <label htmlFor={`${fieldId}-url`}>Address</label>
              <input
                id={`${fieldId}-url`}
                value={draft.baseUrl}
                placeholder="https://example.com/v1"
                inputMode="url"
                onChange={event => setDraft({ ...draft, baseUrl: event.target.value })}
              />
            </>
          )}

          <label htmlFor={`${fieldId}-key`}>API key</label>
          <input
            id={`${fieldId}-key`}
            type="password"
            value={draft.apiKey}
            autoComplete="off"
            onChange={event => setDraft({ ...draft, apiKey: event.target.value })}
          />

          {phase.step === 'failed' && (
            <p className={styles.failure} role="alert">
              {failureText[phase.reason]}
            </p>
          )}

          {phase.step === 'choosing' && (
            <>
              <label htmlFor={`${fieldId}-search`}>Models</label>
              <input
                id={`${fieldId}-search`}
                type="search"
                value={search}
                placeholder={`Search ${offered.length} models`}
                onChange={event => setSearch(event.target.value)}
              />
              <ul className={styles.models}>
                {matching.map(model => (
                  <li key={model.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={draft.models.includes(model.id)}
                        onChange={event =>
                          setDraft({
                            ...draft,
                            models: event.target.checked
                              ? [...draft.models, model.id]
                              : draft.models.filter(id => id !== model.id),
                          })
                        }
                      />
                      {model.name}
                    </label>
                  </li>
                ))}
              </ul>

              <label htmlFor={`${fieldId}-vision`}>Model for images</label>
              <select
                id={`${fieldId}-vision`}
                value={draft.visionModel}
                onChange={event => setDraft({ ...draft, visionModel: event.target.value })}
              >
                <option value="">None — image questions stay unavailable</option>
                {visionOptions.map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </>
          )}

          <div className={styles.actions}>
            <button type="button" onClick={onClose}>
              Close
            </button>
            {phase.step === 'choosing' ? (
              <button type="button" onClick={save} disabled={draft.models.length === 0}>
                Save
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void check()}
                disabled={!draft.apiKey.trim() || (custom && !draft.baseUrl.trim())}
              >
                {phase.step === 'checking' ? 'Checking…' : 'Check key'}
              </button>
            )}
          </div>
        </fieldset>
      </div>
    </ConfirmationDialog>
  )
}
